// The pool route carries what the dash needs to say WHEN a walled account is live again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "./handler.mjs";
import { emptyStore } from "./tally.mjs";
import { ACCOUNTS_KEY, linkHandle } from "./account.mjs";

const SECRET = "s3cret";
const T = 1_789_665_000; // 2026-09-17 12:10 CDT
const H = 3600;

function memStore() {
  const docs = new Map();
  return {
    docs,
    load: async (k) => structuredClone(docs.get(k) ?? (String(k).startsWith("_") ? {} : emptyStore())),
    save: async (k, v) => void docs.set(k, structuredClone(v)),
    getSecret: async () => SECRET,
  };
}

test("pool members carry 5h usage and both reset countdowns", async () => {
  const store = memStore();
  store.docs.set(ACCOUNTS_KEY, { index: linkHandle(linkHandle({}, "reif@x", "reif_tgp"), "reif@x", "reif") });
  const tgp = emptyStore();
  tgp.anchors.push({ ts: T - 60, five_pct: 0, week_pct: 1, five_reset: T + 4 * H, week_reset: T + 7 * H });
  store.docs.set("reif_tgp", tgp);
  const reif = emptyStore();
  reif.anchors.push({ ts: T - 60, five_pct: 0.24, week_pct: 0.46, five_reset: T + 2 * H, week_reset: T + 4 * 86400 });
  store.docs.set("reif", reif);

  const h = createHandler({ store, now: () => T });
  const res = await h({ method: "GET", url: "http://x/api/u/reif/pool", body: "", headers: { authorization: `Bearer ${SECRET}` } });
  const body = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
  // A walled account still appears — the dash exists to say when it is back. Ranked first.
  assert.deepEqual(body.members.map((m) => m.handle), ["reif", "reif_tgp"]);
  const by = Object.fromEntries(body.members.map((m) => [m.handle, m]));
  assert.equal(by.reif_tgp.usage_five_pct, 0);
  assert.equal(by.reif_tgp.week_reset_in_sec, 7 * H);
  assert.equal(by.reif_tgp.five_reset_in_sec, 4 * H);
  assert.equal(by.reif.usage_five_pct, 0.24);
  assert.equal(by.reif.week_reset_in_sec, 4 * 86400);
});
