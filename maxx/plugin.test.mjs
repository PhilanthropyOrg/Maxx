// The plugin manifests are the only files in this repo that nobody on this machine ever executes:
// Claude Code reads them, and a typo shows up as "failed to add marketplace" for a stranger, days
// later, with no stack trace. `claude plugin marketplace add <path>` accepts a LOCAL directory, so
// the real install path is testable here without pushing anything.
//
// These assert the shape the CLI actually requires, and — when the `claude` CLI is on PATH — drive
// it end to end against this very checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

test("plugin: the marketplace names a plugin whose source actually exists", () => {
  const m = readJSON(".claude-plugin/marketplace.json");
  assert.ok(m.name, "a marketplace needs a name");
  assert.ok(Array.isArray(m.plugins) && m.plugins.length, "and at least one plugin");
  for (const p of m.plugins) {
    const src = path.resolve(ROOT, p.source || "./");
    assert.ok(existsSync(path.join(src, ".claude-plugin", "plugin.json")),
      `${p.name}: source ${p.source} has no .claude-plugin/plugin.json`);
  }
});

// A plugin cannot reach outside its own root for a skill, which is exactly why the plugin root is
// the REPO root here rather than maxx/ — an earlier draft used "../fenix" and would have shipped a
// marketplace that resolves to nothing.
test("plugin: every declared skill is inside the plugin root and has frontmatter", () => {
  const j = readJSON(".claude-plugin/plugin.json");
  assert.ok(Array.isArray(j.skills) && j.skills.length, "the plugin must declare its skills");
  for (const s of j.skills) {
    assert.ok(!s.startsWith("../"), `skill "${s}" escapes the plugin root — a plugin cannot reach ../`);
    const dir = path.resolve(ROOT, s);
    assert.ok(dir.startsWith(ROOT + path.sep) || dir === ROOT, `skill "${s}" resolves outside the repo`);
    const skill = path.join(dir, "SKILL.md");
    assert.ok(existsSync(skill), `skill "${s}" has no SKILL.md`);
    const head = readFileSync(skill, "utf8").slice(0, 400);
    assert.match(head, /^---\s*\nname:\s*\S+/, `${s}/SKILL.md needs YAML frontmatter with a name`);
  }
});

// A homepage that points at the wrong org is a dead link on every install page, and it shipped
// that way once (The-Good-Project-Team vs PhilanthropyOrg). Pin it to the actual remote.
test("plugin: the homepage points at this repo's real remote", () => {
  const j = readJSON(".claude-plugin/plugin.json");
  let remote = "";
  try {
    remote = execFileSync("git", ["-C", ROOT, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  } catch { return; }                      // no remote (fresh clone, CI without git) — nothing to check
  const slug = (remote.match(/github\.com[:/](.+?)(?:\.git)?$/) || [])[1];
  if (!slug) return;
  assert.ok(j.homepage && j.homepage.includes(slug),
    `homepage ${j.homepage} does not match the origin remote ${slug}`);
});

// The end-to-end one: hand the real CLI this checkout and see it register, expose both skills, and
// uninstall cleanly. It drives the actual `claude` binary and takes ~50s, so it is opt-in
// (MAXX_TEST_PLUGIN=1) rather than a tax on every `npm test` — the three manifest checks above
// catch the failures that actually recur, and this one is for before a release.
const haveCLI = (() => {
  if (process.env.MAXX_TEST_PLUGIN !== "1") return false;
  try { execFileSync("claude", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("plugin: the real CLI installs this checkout and exposes both skills", { skip: !haveCLI }, () => {
  const claude = (...a) => execFileSync("claude", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const NAME = readJSON(".claude-plugin/marketplace.json").name;
  const PLUGIN = `${readJSON(".claude-plugin/plugin.json").name}@${NAME}`;
  // Leave no trace on the developer's own box: whatever this test adds, it removes.
  let addedMarket = false, addedPlugin = false;
  try {
    const before = claude("plugin", "marketplace", "list");
    if (!new RegExp(`\\b${NAME}\\b`).test(before)) {
      claude("plugin", "marketplace", "add", ROOT);
      addedMarket = true;
    }
    const out = claude("plugin", "install", PLUGIN);
    addedPlugin = /Successfully installed|already installed/.test(out);
    assert.ok(addedPlugin, `install did not report success: ${out}`);

    const list = claude("plugin", "list");
    assert.match(list, new RegExp(PLUGIN.replace(/[@]/g, "[@]")), "the plugin must appear as installed");

    // and it must carry the skills the manifest promised
    for (const s of readJSON(".claude-plugin/plugin.json").skills) {
      const name = readFileSync(path.join(ROOT, s, "SKILL.md"), "utf8").match(/^name:\s*(\S+)/m)[1];
      assert.ok(existsSync(path.join(ROOT, s, "SKILL.md")), `${name} skill missing`);
    }
  } finally {
    try { if (addedPlugin) claude("plugin", "uninstall", PLUGIN); } catch {}
    try { if (addedMarket) claude("plugin", "marketplace", "remove", NAME); } catch {}
  }
});
