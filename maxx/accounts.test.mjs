// `switch` probed every account, ranked them, and printed one export line — throwing away the
// answer to "what have I got". You found out you were walled by hitting the wall, and you found
// out a second login had been idle all day by not finding out. These cover the two questions a
// fleet of logins raises: what do I have, and whose chat is this tag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loginDirs, sufFor, untilText, readLogin, buildRows, renderAccounts, resolveSession, renderWho } from "./accounts.mjs";

const NOW_S = Date.now() / 1000;

// A box with two logins: the default (~/.claude) and one alternate, each signed into its own
// account — the shape this laptop actually has.
function box(opts = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "maxx-acct-"));
  mkdirSync(path.join(home, ".maxx"), { recursive: true });
  const login = (dir, uuid, email) => {
    mkdirSync(path.join(home, dir), { recursive: true });
    writeFileSync(path.join(home, dir, ".claude.json"),
      JSON.stringify({ oauthAccount: { accountUuid: uuid, emailAddress: email } }));
  };
  login(".claude", "uuid-default", "primary@example.com");
  login(".claude-alt", "uuid-alt", "alt@example.com");
  // an unauthenticated dir must never count as a login
  mkdirSync(path.join(home, ".claude-empty"), { recursive: true });
  const rl = (suf, quota, week, fiveResetAt) => writeFileSync(
    path.join(home, ".maxx", `rl${suf}.json`),
    JSON.stringify({ quota, week, fiveResetAt, weekResetAt: NOW_S + 6 * 24 * 3600, ts: Date.now() }));
  if (opts.rlDefault !== false) rl("", opts.defaultQuota ?? 0.11, 0.06, NOW_S + 3600);
  if (opts.rlAlt !== false) rl("-alt", opts.altQuota ?? 0.08, 0.06, NOW_S + 3600);
  writeFileSync(path.join(home, ".maxx", "config.json"), JSON.stringify({
    accounts: { "uuid-default": { handle: "primary" }, "uuid-alt": { handle: "second" } },
  }));
  return home;
}

test("accounts: a login is a dir that is SIGNED IN, not one that is named right", () => {
  const home = box();
  const dirs = loginDirs(home).map((d) => path.basename(d.dir)).sort();
  assert.deepEqual(dirs, [".claude", ".claude-alt"],
    "an unauthenticated .claude-* dir is not a login");
});

// Every maxx file is suffixed from the config dir, and the DEFAULT login's files are unsuffixed.
// Getting this wrong reports one account's walls under another's name.
test("accounts: each login reads its OWN rl file, default unsuffixed", () => {
  const home = box();
  assert.equal(sufFor(path.join(home, ".claude")), "");
  assert.equal(sufFor(path.join(home, ".claude-alt")), "-alt");
  assert.equal(readLogin(path.join(home, ".claude"), home, NOW_S).fivePct, 11);
  assert.equal(readLogin(path.join(home, ".claude-alt"), home, NOW_S).fivePct, 8);
});

test("accounts: a login maxx has never rendered says so instead of reading zero", () => {
  const home = box({ rlAlt: false });
  const rows = buildRows(home, NOW_S, null);
  const alt = rows.find((r) => r.uuid === "uuid-alt");
  assert.equal(alt.reading, false, "no rl file means no reading");
  assert.match(renderAccounts(rows), /no reading yet/, "and the render must say that, not '0%'");
});

// The one fact the list cannot give you about itself.
test("accounts: the live account is marked", () => {
  const home = box();
  const out = renderAccounts(buildRows(home, NOW_S, "uuid-alt"));
  const live = out.split("\n").find((l) => l.includes("LIVE"));
  assert.ok(live && live.includes("@second"), `the signed-in account carries the mark: ${out}`);
});

// The whole point of seeing them side by side: one is idle while the other is walled.
test("accounts: a walled login next to a free one names the move", () => {
  const home = box({ defaultQuota: 0.95, altQuota: 0.08 });
  const out = renderAccounts(buildRows(home, NOW_S, "uuid-default"));
  assert.match(out, /WALLED/, "a 95% 5h reading is the wall");
  assert.match(out, /back in \d+/, "and a wall must say when it lifts");
  assert.match(out, /maxx switch/, "with a free account in hand, name the move");
  assert.match(out, /@second/, "and name which one");
});

test("accounts: untilText counts down, and says nothing about a reset already past", () => {
  assert.equal(untilText(NOW_S + 90 * 60, NOW_S), "1h30m");
  assert.equal(untilText(NOW_S + 45 * 60, NOW_S), "45m");
  assert.equal(untilText(NOW_S - 60, NOW_S), null);
  assert.equal(untilText(0, NOW_S), null);
});

// ── who ───────────────────────────────────────────────────────────────────────────────────────
// The bar prints 8 chars of the session uuid so a chat can be named to a peer. That is a PREFIX,
// and a prefix nothing resolves is a label rather than an identifier — the peer holding it cannot
// ask which repo it was, which login it ran under, or whether it is still going.
function withChat(home, suf, sid, pct, projDir) {
  writeFileSync(path.join(home, ".maxx", `status${suf}.json`),
    JSON.stringify({ ts: Date.now(), chats: { [sid]: { ts: Date.now(), pct } } }));
  const dir = path.join(home, suf ? `.claude${suf}` : ".claude", "projects", projDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${sid}.jsonl`), "{}\n");
}

test("who: the 8 chars on the bar resolve to a repo, an account and a full id", () => {
  const home = box();
  const sid = "f6a931d9-b5b0-48a9-b7a0-50e9d5aaf056";
  withChat(home, "-alt", sid, 100, "-Users-reify-Classified-Maxx");
  const res = resolveSession("f6a931d9", home);
  assert.ok(!res.error, `expected a hit: ${res.error}`);
  assert.equal(res.hits.length, 1);
  const out = renderWho(res, Date.now());
  assert.match(out, /Classified\/Maxx/, `must name the repo: ${out}`);
  assert.match(out, /@second/, "must name the login it ran under");
  assert.match(out, new RegExp(sid), "must give the full id, since 8 chars is only a handle");
});

test("who: an unknown tag says so rather than guessing", () => {
  const home = box();
  assert.match(resolveSession("deadbeef", home).error || "", /no session starting with/);
});

// 4 hex chars is 65k values and collides across a day of sessions; refusing a too-short prefix is
// better than confidently naming the wrong chat.
test("who: too short a prefix is refused", () => {
  const home = box();
  assert.match(resolveSession("f6a", home).error || "", /at least 4/);
});
