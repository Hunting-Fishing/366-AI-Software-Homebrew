import { test } from "node:test";
import assert from "node:assert/strict";
import { availableImageProviders, generateImage } from "../src/providers/images.js";

test("lists both image providers with configured flags", () => {
  const providers = availableImageProviders();
  const ids = providers.map((p) => p.id).sort();
  assert.deepEqual(ids, ["google", "openai"]);
  for (const p of providers) {
    assert.equal(typeof p.configured, "boolean");
    assert.ok(p.model.length > 0);
  }
});

test("unknown provider is rejected", async () => {
  await assert.rejects(() => generateImage("nope", "a cat"), /Unknown image provider/);
});

test("missing key gives a helpful error", async (t) => {
  if (process.env.OPENAI_API_KEY) {
    t.skip("key is set in this environment");
    return;
  }
  await assert.rejects(() => generateImage("openai", "a cat"), /No API key set/);
});
