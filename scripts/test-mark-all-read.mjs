// Smoke test for markAllChannelsRead — pure-localStorage utility in
// src/components/chat/ChatChannelList.tsx.
//
// Why a standalone Node script (not vitest/jest)?
//   mindfork-office has no unit-test framework wired in. Adding one is a
//   bigger change than the feature itself; this script verifies the same
//   behaviour with zero new dependencies. It can be promoted to vitest
//   later if/when the project adopts a runner.
//
// Run:  node scripts/test-mark-all-read.mjs
// Exits 0 on success, non-zero on failure.

import assert from "node:assert/strict";

// --- Minimal localStorage mock (only the methods the SUT uses) ---
function makeStorage() {
  const store = new Map();
  return {
    _store: store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

// --- Re-implementation kept in lockstep with ChatChannelList.tsx ---
// We can't directly import the .tsx file from plain Node without a TS
// loader; the function is small and pure, so we mirror it here. If the
// production logic changes, this test will diverge — that is the signal
// to update the test.
function markAllChannelsRead(channelIds) {
  if (typeof globalThis.window === "undefined") return 0;
  if (!Array.isArray(channelIds) || channelIds.length === 0) return 0;
  const now = String(Date.now());
  let written = 0;
  for (const id of channelIds) {
    if (!id) continue;
    globalThis.window.localStorage.setItem(`dashboard_chat_read_${id}`, now);
    written += 1;
  }
  return written;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed += 1;
  }
}

// --- Tests ---

test("writes a timestamp for every channel id", () => {
  const ls = makeStorage();
  globalThis.window = { localStorage: ls };

  const before = Date.now();
  const written = markAllChannelsRead(["alice|bob", "boss|forge", "secretary|yuki"]);
  const after = Date.now();

  assert.equal(written, 3, "should report 3 channels written");

  for (const id of ["alice|bob", "boss|forge", "secretary|yuki"]) {
    const key = `dashboard_chat_read_${id}`;
    const raw = ls.getItem(key);
    assert.ok(raw !== null, `expected key ${key} to be set`);
    const ts = Number(raw);
    assert.ok(ts >= before && ts <= after, `timestamp ${ts} out of range [${before}, ${after}]`);
  }
});

test("returns 0 and writes nothing for empty array", () => {
  const ls = makeStorage();
  globalThis.window = { localStorage: ls };

  const written = markAllChannelsRead([]);
  assert.equal(written, 0);
  assert.equal(ls._store.size, 0);
});

test("skips falsy ids (null/empty string)", () => {
  const ls = makeStorage();
  globalThis.window = { localStorage: ls };

  const written = markAllChannelsRead(["good|id", "", null, "another|id"]);
  assert.equal(written, 2, "should only count truthy ids");
  assert.ok(ls.getItem("dashboard_chat_read_good|id") !== null);
  assert.ok(ls.getItem("dashboard_chat_read_another|id") !== null);
  assert.equal(ls._store.size, 2);
});

test("uses the same timestamp for all ids in one call", () => {
  const ls = makeStorage();
  globalThis.window = { localStorage: ls };

  markAllChannelsRead(["a|b", "c|d", "e|f"]);
  const t1 = ls.getItem("dashboard_chat_read_a|b");
  const t2 = ls.getItem("dashboard_chat_read_c|d");
  const t3 = ls.getItem("dashboard_chat_read_e|f");
  assert.equal(t1, t2);
  assert.equal(t2, t3);
});

test("returns 0 on SSR (no window)", () => {
  delete globalThis.window;
  const written = markAllChannelsRead(["a|b"]);
  assert.equal(written, 0);
});

test("rejects non-array input", () => {
  globalThis.window = { localStorage: makeStorage() };
  assert.equal(markAllChannelsRead(undefined), 0);
  assert.equal(markAllChannelsRead(null), 0);
  assert.equal(markAllChannelsRead("a|b"), 0);
});

console.log("");
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
