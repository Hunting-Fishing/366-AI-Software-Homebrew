import { test } from "node:test";
import assert from "node:assert/strict";
import { config, maxTokensFor } from "../src/config.js";

// These lock in the fix for the silent-truncation bug: a single global
// 16000 output cap was shared by all three providers, so multi-file
// projects lost their trailing files with no error.

test("every provider has its own output ceiling", () => {
  for (const provider of Object.keys(config.models)) {
    const limit = maxTokensFor(provider);
    assert.equal(typeof limit, "number", `${provider} has no numeric ceiling`);
    assert.ok(limit > 0, `${provider} ceiling must be positive`);
  }
});

test("ceilings are well above the old 16k global cap", () => {
  for (const provider of Object.keys(config.models)) {
    assert.ok(
      maxTokensFor(provider) > 16000,
      `${provider} is still capped at or below the old 16000 limit`
    );
  }
});

test("ceilings match each model's documented maximum output", () => {
  // Defaults only — an env override legitimately changes these, so we
  // assert the shipped defaults rather than the live values when the
  // corresponding *_MAX_TOKENS var is set.
  if (!process.env.ANTHROPIC_MAX_TOKENS) {
    assert.equal(maxTokensFor("anthropic"), 64000);
  }
  if (!process.env.OPENAI_MAX_TOKENS) {
    assert.equal(maxTokensFor("openai"), 32768);
  }
  if (!process.env.GOOGLE_MAX_TOKENS) {
    assert.equal(maxTokensFor("google"), 65536);
  }
});

test("an unknown provider falls back to a safe floor rather than NaN", () => {
  assert.equal(maxTokensFor("some-future-provider"), 16000);
});

test("providers and model entries stay in sync", () => {
  assert.deepEqual(
    Object.keys(config.models).sort(),
    Object.keys(config.maxTokens).sort(),
    "every model needs a matching maxTokens entry"
  );
});
