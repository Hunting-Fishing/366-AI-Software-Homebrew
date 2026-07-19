// Async ProjectStore tests (v1.9) — replaces projects.test.ts,
// which predates the Promise-based interface.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonProjectStore } from "../src/services/projects.js";
import { supabaseConfigured, SupabaseProjectStore } from "../src/services/supabase.js";

function tempStore() {
  return new JsonProjectStore(fs.mkdtempSync(path.join(os.tmpdir(), "p2-")));
}

test("async save/get round-trips with binaries", async () => {
  const store = tempStore();
  const saved = await store.save("My App", "prompt", "<p>x</p>", "godot", [], [{ path: "assets/a.png", b64: "AA" }]);
  const loaded = await store.get(saved.id);
  assert.ok(loaded);
  assert.equal(loaded.binaries[0]?.path, "assets/a.png");
});

test("async list returns summaries", async () => {
  const store = tempStore();
  await store.save("One", "", "<p>1</p>");
  const list = await store.list();
  assert.equal(list.length, 1);
});

test("supabase store refuses to start without keys", (t) => {
  if (supabaseConfigured()) {
    t.skip("supabase configured in this environment");
    return;
  }
  assert.throws(() => new SupabaseProjectStore(), /SETUP-SUPABASE/);
});
