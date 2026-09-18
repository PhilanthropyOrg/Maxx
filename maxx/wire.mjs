/**
 * maxx wire — finish an install that only dropped the skills in.
 *
 * There are two ways to get maxx, and they are NOT equivalent:
 *
 *   curl … | bash      places the files AND edits ~/.claude/settings.json — statusline, the
 *                      budget gate, and fenix's two hooks. Everything works.
 *   /plugin install    places the skills. That is all a plugin does; it cannot write to
 *                      settings.json. So `/maxx` answers, and the bar never appears.
 *
 * The second path is the one that looks broken. The headline feature of maxx is a statusline,
 * and a user who installed the plugin gets skills that talk about a bar they cannot see — with
 * nothing on screen to explain the gap. Same for fenix: its whole loop is two hooks, so without
 * them /fenix writes a handoff that nothing ever reads back.
 *
 * `maxx wire` closes that gap from wherever the skill actually landed. It is the same settings
 * surgery install.sh does, minus the file copying, and it is idempotent: re-pointing an existing
 * maxx hook rather than stacking a second one.
 *
 * `maxx wire --check` reports without touching anything — what the status card uses to tell a
 * plugin user what they are missing.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOME = homedir();

/** Where this copy of maxx is running from — a plugin dir, ~/.claude/skills/maxx, or a checkout. */
export function selfDir() {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * fenix ships beside maxx (same plugin, sibling skill dirs) but an older layout put it inside the
 * maxx skill dir. Look in both rather than assume, and return null when it genuinely is not here —
 * a maxx-only install must wire no fenix hooks rather than dangling ones.
 */
export function findFenix(dir = selfDir(), home = process.env.HOME || HOME) {
  for (const p of [
    path.join(dir, "..", "fenix", "fenix.mjs"),   // plugin / repo layout: skills side by side
    path.join(home, ".claude", "skills", "fenix", "fenix.mjs"),
    path.join(dir, "fenix.mjs"),                  // legacy: fenix lived inside the maxx skill
  ]) {
    try { if (existsSync(p)) return path.resolve(p); } catch {}
  }
  return null;
}

/**
 * What is wired right now. `settingsPath` and `node` are injectable so this is testable without
 * touching the real ~/.claude.
 */
export function inspect(settingsPath = path.join(HOME, ".claude", "settings.json"), dir = selfDir(), home = process.env.HOME || HOME) {
  let d = {};
  let unreadable = false;
  if (existsSync(settingsPath)) {
    try { d = JSON.parse(readFileSync(settingsPath, "utf8")); }
    catch { unreadable = true; }
  }
  if (d === null || typeof d !== "object" || Array.isArray(d)) unreadable = true;
  const cmds = (k) => (((d.hooks || {})[k]) || []).flatMap((e) => (e.hooks || []).map((h) => h.command || ""));
  const render = path.join(dir, "render.mjs");
  return {
    unreadable,
    // the bar is "ours" only if it points at THIS copy — a statusline from another tool is theirs
    statusline: !!(d.statusLine && String(d.statusLine.command || "").includes(render)),
    gate: cmds("PreToolUse").some((c) => c.includes(path.join(dir, "gate.mjs"))),
    wake: cmds("SessionStart").some((c) => /fenix\.mjs --wake\b/.test(c)),
    ready: cmds("Stop").some((c) => /fenix\.mjs --ready\b/.test(c)),
    fenix: findFenix(dir, home),
  };
}

/** The one-line summary the status card prints. Null when everything that can be wired is. */
export function missingText(s) {
  const gaps = [];
  if (!s.statusline) gaps.push("the statusline");
  if (!s.gate) gaps.push("the budget gate");
  if (s.fenix && !(s.wake && s.ready)) gaps.push("the fenix loop");
  if (!gaps.length) return null;
  const list = gaps.length === 1 ? gaps[0] : gaps.slice(0, -1).join(", ") + " and " + gaps[gaps.length - 1];
  return `maxx: ${list} ${gaps.length === 1 ? "is" : "are"} not wired yet — run \`maxx wire\` (installs into ~/.claude/settings.json).`;
}

/**
 * Wire it. Returns {changed:[…]} or {error} — never throws on a bad settings file, because the
 * user's settings.json is worth more than our install: an unreadable one is left exactly alone,
 * the same rule install.sh follows.
 */
export function wire({ settingsPath = path.join(HOME, ".claude", "settings.json"),
                       dir = selfDir(), nodeBin = process.execPath, apply = true,
                       home = process.env.HOME || HOME } = {}) {
  let d = {};
  if (existsSync(settingsPath)) {
    let raw;
    try { raw = readFileSync(settingsPath, "utf8"); } catch (e) { return { error: `cannot read ${settingsPath}: ${e.message}` }; }
    try { d = JSON.parse(raw); } catch (e) {
      return { error: `${settingsPath} is not valid JSON — ${e.message}. Not touching it; fix that file and re-run.` };
    }
    if (d === null || typeof d !== "object" || Array.isArray(d)) {
      return { error: `${settingsPath} is valid JSON but not an object — refusing to overwrite it.` };
    }
  }
  const changed = [];
  const render = path.join(dir, "render.mjs");
  const gate = path.join(dir, "gate.mjs");
  const fenix = findFenix(dir, home);

  if (!d.statusLine || !String(d.statusLine.command || "").includes(render)) {
    d.statusLine = { type: "command", command: `${nodeBin} ${render}`, padding: 0, refreshInterval: 2 };
    changed.push("statusline");
  }
  d.hooks = d.hooks || {};
  // Re-point rather than append: a second copy of our own hook would run the same work twice per
  // tool call. Anything that is not ours is left untouched.
  const before = JSON.stringify(d.hooks.PreToolUse || []);
  d.hooks.PreToolUse = (d.hooks.PreToolUse || []).filter((h) => !JSON.stringify(h).includes(gate));
  d.hooks.PreToolUse.push({
    matcher: "Agent|Task|Workflow|ScheduleWakeup|CronCreate",
    hooks: [{ type: "command", command: `${nodeBin} ${gate}`, timeout: 10 }],
  });
  if (JSON.stringify(d.hooks.PreToolUse) !== before) changed.push("budget gate");

  if (fenix) {
    const isFenix = (h) => /fenix\.mjs/.test(JSON.stringify(h));
    const b2 = JSON.stringify([d.hooks.SessionStart || [], d.hooks.Stop || []]);
    d.hooks.SessionStart = (d.hooks.SessionStart || []).filter((h) => !isFenix(h));
    d.hooks.SessionStart.push({ hooks: [{ type: "command", command: `${nodeBin} ${fenix} --wake`, timeout: 10 }] });
    d.hooks.Stop = (d.hooks.Stop || []).filter((h) => !isFenix(h));
    d.hooks.Stop.push({ hooks: [{ type: "command", command: `${nodeBin} ${fenix} --ready`, timeout: 10 }] });
    if (JSON.stringify([d.hooks.SessionStart, d.hooks.Stop]) !== b2) changed.push("fenix loop");
  }

  if (apply && changed.length) {
    try {
      if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak-maxx`);
      writeFileSync(settingsPath, JSON.stringify(d, null, 2));
    } catch (e) { return { error: `cannot write ${settingsPath}: ${e.message}` }; }
  }
  return { changed, fenix, settingsPath };
}

export function renderWire(res) {
  if (res.error) return `  ${res.error}`;
  if (!res.changed.length) return "  maxx: already wired — statusline, budget gate" + (res.fenix ? " and the fenix loop" : "") + " are all in place.";
  const out = [`  maxx: wired ${res.changed.join(", ")}.`];
  if (!res.fenix) out.push("  (no fenix alongside this maxx — its loop was skipped.)");
  out.push("  Restart Claude Code to see the bar.");
  return out.join("\n");
}
