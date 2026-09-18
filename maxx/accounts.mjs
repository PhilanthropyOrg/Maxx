/**
 * maxx accounts — every login on this box, side by side.
 *
 * `switch` already knew all of this and threw it away: it probes every account, ranks them and
 * prints one export line. The question "what have I got" has no answer anywhere — you find out
 * you are walled by hitting the wall, and you find out a second login was idle all day by not
 * finding out. A fleet of logins you cannot see is a fleet you cannot use.
 *
 * One row per account: who it is, which config dir it lives in, how much of each window it has
 * spent, and — the one thing no other surface says — WHEN a walled one comes back.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HOME = homedir();

/**
 * Every authenticated Claude config dir on the box, as {dir, email, uuid, isDefault}.
 *
 * Discovery is by WHO IS SIGNED IN, not by directory naming — the same lesson configDirFor
 * learned the hard way: this laptop has ~/.claude, ~/.claude-gmail and ~/.claude-reif_personal,
 * and a ~/.claude-<handle> rule guesses wrong for most of them. A dir counts only if it carries
 * a readable .claude.json with an oauthAccount, which is exactly what "logged in" means.
 */
export function loginDirs(home = HOME) {
  const out = [];
  const add = (dir, isDefault) => {
    try {
      const j = JSON.parse(readFileSync(path.join(dir, ".claude.json"), "utf8"));
      const oa = j.oauthAccount;
      if (!oa?.accountUuid) return;
      out.push({ dir, isDefault, email: oa.emailAddress || null, uuid: oa.accountUuid });
    } catch { /* not an authenticated config dir */ }
  };
  add(path.join(home, ".claude"), true);
  try {
    for (const e of readdirSync(home, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith(".claude-")) continue;
      add(path.join(home, e.name), false);
    }
  } catch {}
  return out;
}

/**
 * maxx writes one status/rl file per login, suffixed from the config dir (render.mjs's SUF rule).
 * The DEFAULT login's files are unsuffixed. Returns the suffix for a given dir so a reading is
 * always matched to the account it belongs to — the wrong file would report another login's walls.
 */
export function sufFor(dir, home = HOME) {
  const base = path.basename(dir);
  return base === ".claude" ? "" : "-" + base.replace(/^\.claude-?/, "");
}

/** How long until a reset, as a short human string. Null when there is nothing to count down. */
export function untilText(resetSec, nowSec) {
  if (!resetSec || resetSec <= nowSec) return null;
  const m = Math.round((resetSec - nowSec) / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h${m % 60}m` : `${h}h`;
}

/**
 * Read one login's local view: the rl.json cache the statusline keeps per account.
 *
 * LOCAL on purpose. The server probe (`setup.probeAccount`) needs a handle, a secret and a
 * round-trip per account, and it reports the ACCOUNT's usage rather than what this box last saw.
 * `accounts` has to answer instantly and work offline, so it reads the same cache the bar reads.
 * A login maxx has never rendered simply has no reading, and says so rather than guessing zero.
 */
export function readLogin(dir, home = HOME, nowSec = Date.now() / 1000) {
  const suf = sufFor(dir, home);
  let rl = null;
  try { rl = JSON.parse(readFileSync(path.join(home, ".maxx", `rl${suf}.json`), "utf8")); } catch {}
  if (!rl) return { suf, reading: false };
  const five = typeof rl.quota === "number" ? rl.quota : null;
  const week = typeof rl.week === "number" ? rl.week : null;
  // A wall is Anthropic's own 5h reading at the top of its range — the same 90% the bar calls red.
  const walled = five != null && five >= 0.9;
  return {
    suf, reading: true,
    fivePct: five == null ? null : Math.round(five * 100),
    weekPct: week == null ? null : Math.round(week * 100),
    walled,
    freeIn: walled ? untilText(rl.fiveResetAt, nowSec) : null,
    weekIn: untilText(rl.weekResetAt, nowSec),
    ts: rl.ts || 0,
  };
}

/** The handle maxx ships this account's burn under, when it knows one. Cosmetic; never required. */
export function handleFor(uuid, home = HOME) {
  try {
    const cfg = JSON.parse(readFileSync(path.join(home, ".maxx", "config.json"), "utf8"));
    const a = (cfg.accounts || {})[uuid];
    if (a?.handle) return a.handle;
    return cfg.handle || null;
  } catch { return null; }
}

/**
 * Build the rows. `liveUuid` is the account this very session is signed into — the one fact a
 * human cannot get from the list itself, and the thing that makes "which one am I on" answerable.
 */
export function buildRows(home = HOME, nowSec = Date.now() / 1000, liveUuid = null) {
  return loginDirs(home).map((L) => ({
    ...L,
    handle: handleFor(L.uuid, home),
    live: !!liveUuid && L.uuid === liveUuid,
    ...readLogin(L.dir, home, nowSec),
  }));
}

/**
 * Render. Two lines per account: identity, then the numbers.
 *
 * Percent-used in both windows, because that is what every other maxx surface prints and a second
 * convention would make the two impossible to compare at a glance. The week's reset rides on the
 * same line so "6% used" is readable — 6% is excellent on Friday and alarming an hour in.
 */
export function renderAccounts(rows) {
  if (!rows.length) return "  no Claude logins found on this box.";
  const out = [];
  for (const r of rows) {
    const who = r.handle ? `@${r.handle}` : (r.email || "(unknown account)");
    const mark = r.live ? "  ● LIVE" : "";
    out.push(`  ${who}${mark}`);
    const where = r.dir.replace(HOME, "~");
    out.push(`     ${where}${r.email && r.handle ? `  ·  ${r.email}` : ""}`);
    if (!r.reading) {
      out.push("     no reading yet — open Claude Code under this login once to seed it");
      continue;
    }
    const bits = [];
    bits.push(`week ${r.weekPct == null ? "—" : r.weekPct + "%"}`);
    bits.push(`5h ${r.fivePct == null ? "—" : r.fivePct + "%"}`);
    if (r.walled) bits.push(r.freeIn ? `WALLED · back in ${r.freeIn}` : "WALLED");
    else if (r.weekIn) bits.push(`week resets in ${r.weekIn}`);
    out.push(`     ${bits.join("  ·  ")}`);
  }
  // The point of seeing them together: one is usually idle while another is walled.
  const free = rows.filter((r) => r.reading && !r.walled && !r.live);
  const walled = rows.filter((r) => r.reading && r.walled);
  if (walled.length && free.length) {
    const best = free.sort((a, b) => (a.fivePct ?? 100) - (b.fivePct ?? 100))[0];
    const who = best.handle ? `@${best.handle}` : best.dir.replace(HOME, "~");
    out.push("");
    out.push(`  ${walled.length} walled, ${free.length} with room — \`eval "$(maxx switch)"\` moves to ${who}.`);
  }
  return out.join("\n");
}

/**
 * Resolve a session tag back to a session.
 *
 * The statusline prints 8 chars of the session uuid so you can name THIS chat to another one
 * ("the fix is in f6a931d9"). That is a prefix, and a prefix nothing can look up is a label, not
 * an identifier — the peer holding it has no way to ask which repo it was, which login it ran
 * under, or whether it is still going.
 *
 * Every login's status.json carries a `chats` map keyed by full session id, and every session's
 * transcript is <id>.jsonl under that login's projects tree. Both are searched by prefix, so the
 * 8 chars on the bar are enough.
 */
export function resolveSession(prefix, home = HOME, nowMs = Date.now()) {
  const want = String(prefix || "").trim().toLowerCase();
  if (want.length < 4) return { error: "give at least 4 characters of the id" };
  const hits = [];
  for (const L of loginDirs(home)) {
    const suf = sufFor(L.dir, home);
    // the chat's own scoring, from the statusline that rendered it
    let chats = {};
    try { chats = JSON.parse(readFileSync(path.join(home, ".maxx", `status${suf}.json`), "utf8")).chats || {}; } catch {}
    for (const [sid, row] of Object.entries(chats)) {
      if (!sid.toLowerCase().startsWith(want)) continue;
      hits.push({ sid, login: L, handle: handleFor(L.uuid, home), row, where: null });
    }
  }
  // locate each hit's project directory from its transcript path — that is what says WHICH REPO,
  // the fact a peer actually wants and the one thing the chats map does not carry.
  for (const h of hits) {
    const projRoot = path.join(h.login.dir, "projects");
    try {
      for (const d of readdirSync(projRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const f = path.join(projRoot, d.name, `${h.sid}.jsonl`);
        if (existsSync(f)) { h.where = d.name.replace(/^-/, "/").replace(/-/g, "/"); h.file = f; break; }
      }
    } catch {}
  }
  if (!hits.length) return { error: `no session starting with "${want}" on this box` };
  return { hits };
}

export function renderWho(res, nowMs = Date.now()) {
  if (res.error) return `  ${res.error}`;
  const out = [];
  for (const h of res.hits) {
    const age = h.row?.ts ? Math.round((nowMs - h.row.ts) / 60000) : null;
    // "live" is a judgement about a statusline reading, so it is stated as what it is: how long
    // since that chat last rendered. A chat renders about once a second while it is being used.
    const seen = age == null ? "never rendered" : age < 2 ? "LIVE (rendering now)" : age < 90 ? `last seen ${age}m ago` : `last seen ${Math.round(age / 60)}h ago`;
    out.push(`  ${h.sid.slice(0, 8)}  ${seen}`);
    if (h.where) out.push(`     ${h.where}`);
    out.push(`     ${h.handle ? "@" + h.handle : h.login.dir.replace(HOME, "~")}${h.row?.pct != null ? `  ·  chat ${h.row.pct}%` : ""}`);
    out.push(`     full id: ${h.sid}`);
  }
  return out.join("\n");
}
