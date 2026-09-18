// There are two ways to get maxx and they are NOT equivalent. `curl | bash` places the files AND
// edits settings.json. `/plugin install` places the skills — that is all a plugin can do, it
// cannot write settings.json — so the statusline never appears and fenix's loop has no hooks.
//
// That is the install that LOOKS broken: the headline feature of maxx is a bar, and a plugin user
// gets skills that talk about a bar they cannot see, with nothing on screen to explain the gap.
// These cover the two things that close it: a card that says what is missing, and `maxx wire`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wire, inspect, missingText, findFenix } from "./wire.mjs";

const SKILLDIR = path.dirname(fileURLToPath(import.meta.url));
const NODE = "/usr/local/bin/node";
const fresh = () => {
  const home = mkdtempSync(path.join(tmpdir(), "maxx-wire-"));
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  return home;
};
const settings = (home) => path.join(home, ".claude", "settings.json");
const read = (home) => JSON.parse(readFileSync(settings(home), "utf8"));

test("wire: a plugin install is told exactly what it is missing", () => {
  const home = fresh();
  writeFileSync(settings(home), JSON.stringify({ model: "opus" }));
  const msg = missingText(inspect(settings(home), SKILLDIR));
  assert.ok(msg, "an unwired box must say something");
  assert.match(msg, /statusline/, "the bar is the headline feature — name it");
  assert.match(msg, /maxx wire/, "and name the command that fixes it");
});

test("wire: installs the statusline, the gate and the fenix loop", () => {
  const home = fresh();
  writeFileSync(settings(home), JSON.stringify({ model: "opus" }));
  const res = wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  assert.ok(!res.error, res.error);
  const d = read(home);
  assert.match(d.statusLine.command, /render\.mjs$/, "the bar must be wired");
  assert.ok(d.statusLine.command.startsWith(NODE), "to an absolute node — hooks have no login PATH");
  const cmds = (k) => (d.hooks[k] || []).flatMap((e) => e.hooks.map((h) => h.command));
  assert.ok(cmds("PreToolUse").some((c) => c.includes("gate.mjs")), "budget gate");
  assert.ok(cmds("SessionStart").some((c) => /fenix\.mjs --wake$/.test(c)), "resume half");
  assert.ok(cmds("Stop").some((c) => /fenix\.mjs --ready$/.test(c)), "the ask half");
  // and the card goes quiet once everything is in place
  assert.equal(missingText(inspect(settings(home), SKILLDIR)), null, "nothing left to report");
});

test("wire: the user's own settings and other tools' hooks survive", () => {
  const home = fresh();
  writeFileSync(settings(home), JSON.stringify({
    model: "opus",
    permissions: { allow: ["Bash(ls:*)"] },
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/usr/bin/true" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: "/opt/other/tool --wake" }] }],
      Stop: [{ hooks: [{ type: "command", command: "/opt/other/stop" }] }],
    },
  }));
  wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  const d = read(home);
  assert.equal(d.model, "opus");
  assert.deepEqual(d.permissions, { allow: ["Bash(ls:*)"] });
  const all = ["PreToolUse", "SessionStart", "Stop"].flatMap((k) => (d.hooks[k] || []).flatMap((e) => e.hooks.map((h) => h.command)));
  for (const c of ["/usr/bin/true", "/opt/other/tool --wake", "/opt/other/stop"])
    assert.ok(all.includes(c), `another tool's hook was dropped: ${c}`);
});

test("wire: running it twice does not stack a second copy of our hooks", () => {
  const home = fresh();
  wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  const second = wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  assert.deepEqual(second.changed, [], "a wired box has nothing left to change");
  const d = read(home);
  const count = (k, re) => (d.hooks[k] || []).flatMap((e) => e.hooks.map((h) => h.command)).filter((c) => re.test(c)).length;
  assert.equal(count("PreToolUse", /gate\.mjs/), 1);
  assert.equal(count("SessionStart", /fenix\.mjs --wake/), 1);
  assert.equal(count("Stop", /fenix\.mjs --ready/), 1);
});

// The same rule install.sh follows: their settings.json is worth more than our install. A file we
// cannot parse is left exactly alone, because the alternative is silently eating their config.
test("wire: an unparseable settings.json is refused, not overwritten", () => {
  const home = fresh();
  const original = '{\n  "model": "opus",\n  // a comment\n}\n';
  writeFileSync(settings(home), original);
  const res = wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  assert.ok(res.error, "must refuse");
  assert.match(res.error, /not valid JSON/);
  assert.equal(readFileSync(settings(home), "utf8"), original, "their file must be untouched");
});

test("wire: a settings.json that is JSON but not an object is refused too", () => {
  const home = fresh();
  writeFileSync(settings(home), '["nope"]');
  const res = wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  assert.ok(res.error, "must refuse");
  assert.equal(readFileSync(settings(home), "utf8"), '["nope"]');
});

// A maxx WITHOUT fenix beside it must wire no fenix hooks at all — a hook pointing at a file that
// does not exist fails on every session start, which is worse than not having the feature.
test("wire: no fenix alongside means no fenix hooks", () => {
  const home = fresh();
  const lonely = mkdtempSync(path.join(tmpdir(), "maxx-lonely-"));
  writeFileSync(path.join(lonely, "render.mjs"), "");
  writeFileSync(path.join(lonely, "gate.mjs"), "");
  // findFenix also looks in ~/.claude/skills/fenix, so point HOME somewhere without one
  const realHome = process.env.HOME;
  process.env.HOME = home;
  try {
    assert.equal(findFenix(lonely), null, "there is genuinely no fenix here");
    const res = wire({ settingsPath: settings(home), dir: lonely, nodeBin: NODE });
    const d = read(home);
    const all = ["SessionStart", "Stop"].flatMap((k) => (d.hooks[k] || []).flatMap((e) => e.hooks.map((h) => h.command)));
    assert.ok(!all.some((c) => c.includes("fenix")), `no dangling fenix hook: ${JSON.stringify(all)}`);
    assert.ok(!res.changed.includes("fenix loop"));
  } finally { process.env.HOME = realHome; }
});

test("wire: a backup is taken before the first write", () => {
  const home = fresh();
  writeFileSync(settings(home), JSON.stringify({ model: "opus" }));
  wire({ settingsPath: settings(home), dir: SKILLDIR, nodeBin: NODE });
  assert.ok(existsSync(`${settings(home)}.bak-maxx`), "their pre-wire settings must be recoverable");
  assert.equal(JSON.parse(readFileSync(`${settings(home)}.bak-maxx`, "utf8")).model, "opus");
});
