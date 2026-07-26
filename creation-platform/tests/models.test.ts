import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ROLES, TIERS, MODELS, resolve, routingPlan, sanitiseRouting, modelForTier, envKey,
} from "../src/models.js";

// One model for everything is the wrong shape. Splitting a 700-line
// file without breaking a database key is deep multi-file reasoning
// and a mistake costs an hour. Drafting five one-line suggestions is a
// paragraph, and a mistake costs nothing because nobody clicks it.
//
// So the work is split into roles, each with a default tier, all
// overridable.

test("every role explains itself", () => {
  // The "why" is shown next to the control, so a user can disagree
  // with a default on the merits rather than by guessing.
  for (const r of ROLES) {
    assert.ok(r.what.length > 30, `${r.id}: what is too thin`);
    assert.ok(r.why.length > 60, `${r.id}: why is too thin`);
    assert.ok(TIERS.some((t) => t.id === r.defaultTier), `${r.id}: unknown tier`);
  }
});

test("the risky jobs get the deep tier and the cheap ones do not", () => {
  const tierOf = (id: string) => ROLES.find((r) => r.id === id)!.defaultTier;
  // Fixing and refactoring are where a wrong guess costs real time —
  // a bad fix edits the wrong file and leaves you further from working.
  assert.equal(tierOf("fix"), "deep");
  assert.equal(tierOf("refactor"), "deep");
  assert.equal(tierOf("create"), "deep");
  // And the throwaway output must not be on a frontier model.
  assert.equal(tierOf("suggest"), "fast");
  assert.equal(tierOf("name"), "fast");
  // Everyday edits sit in the middle: most prompts land here, and
  // speed matters when iterating.
  assert.equal(tierOf("edit"), "balanced");
});

test("every provider covers every tier", () => {
  for (const [provider, tiers] of Object.entries(MODELS)) {
    for (const t of TIERS) {
      assert.ok(tiers[t.id], `${provider} has no ${t.id} model`);
    }
  }
});

test("no two tiers of one provider are the same model", () => {
  // Identical ids would mean the tier control does nothing, which is
  // worse than not offering it.
  for (const [provider, tiers] of Object.entries(MODELS)) {
    const ids = Object.values(tiers);
    assert.equal(new Set(ids).size, ids.length, `${provider} repeats a model across tiers`);
  }
});

// ── Resolution ──────────────────────────────────────────────

test("an untouched routing table behaves as one provider with tiers", () => {
  // The header provider still decides WHO; the role decides how much.
  const r = resolve("fix", "anthropic");
  assert.equal(r.provider, "anthropic");
  assert.equal(r.tier, "deep");
  assert.equal(r.model, MODELS.anthropic.deep);
});

test("a role can be moved to another provider entirely", () => {
  // Mixing providers within one build is the point — best-at-the-job
  // rather than best-overall.
  const r = resolve("suggest", "anthropic", { suggest: { provider: "google" } });
  assert.equal(r.provider, "google");
  assert.equal(r.tier, "fast", "an unset tier still falls back to the role default");
  assert.equal(r.model, MODELS.google.fast);
});

test("a tier override applies without changing provider", () => {
  const r = resolve("edit", "openai", { edit: { tier: "deep" } });
  assert.equal(r.provider, "openai");
  assert.equal(r.model, MODELS.openai.deep);
});

test("environment overrides win, so a model rename needs no deploy", () => {
  // Model names change on somebody else's schedule. A rename must
  // never require shipping code.
  const key = envKey("anthropic", "deep");
  assert.equal(key, "ANTHROPIC_MODEL_DEEP");
  const saved = process.env[key];
  process.env[key] = "claude-something-newer";
  try {
    assert.equal(modelForTier("anthropic", "deep"), "claude-something-newer");
  } finally {
    if (saved === undefined) delete process.env[key]; else process.env[key] = saved;
  }
});

test("an unknown provider degrades instead of throwing", () => {
  assert.equal(modelForTier("nonesuch", "deep"), "");
});

// ── The table the settings screen renders ───────────────────

test("the plan covers every role and marks the overridden ones", () => {
  const plan = routingPlan("anthropic", { fix: { provider: "openai" } });
  assert.equal(plan.length, ROLES.length);
  assert.equal(plan.find((p) => p.id === "fix")!.overridden, true);
  assert.equal(plan.find((p) => p.id === "edit")!.overridden, false);
});

// ── Nothing from the browser is trusted ─────────────────────

test("an invented model name cannot reach a provider", () => {
  // The browser sends the routing table. Without sanitising, a crafted
  // request would name any string as a model and we would forward it.
  const dirty = {
    fix: { provider: "anthropic", tier: "deep" },
    edit: { provider: "evil-corp", tier: "deep" },
    plan: { provider: "google", tier: "ultra-mega" },
    notARole: { provider: "anthropic" },
    create: "nonsense",
  };
  const clean = sanitiseRouting(dirty);
  assert.deepEqual(clean.fix, { provider: "anthropic", tier: "deep" });
  assert.deepEqual(clean.edit, { tier: "deep" }, "the bogus provider is dropped, the valid tier kept");
  assert.deepEqual(clean.plan, { provider: "google" }, "the bogus tier is dropped");
  assert.ok(!("notARole" in clean));
  assert.ok(!("create" in clean));
});

test("junk input produces an empty table rather than an error", () => {
  for (const junk of [null, undefined, "x", 42, []]) {
    assert.deepEqual(sanitiseRouting(junk), {});
  }
});

// ── Wiring ──────────────────────────────────────────────────

const LANE = fs.readFileSync(new URL("../src/lanes/inhouse.ts", import.meta.url), "utf8");
const BRAIN = fs.readFileSync(new URL("../src/services/brain.ts", import.meta.url), "utf8");
const GEN = fs.readFileSync(new URL("../src/routes/generate.ts", import.meta.url), "utf8");
const PAGE = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("the lane routes each call by its role", () => {
  assert.match(LANE, /resolve\(role, req\.provider, req\.routing\)/);
  assert.match(LANE, /runStream\(fixMessages, "fix"\)/);
});

test("a refactor is routed apart from an ordinary edit", () => {
  // Both are edits, but only one can silently orphan a database key.
  assert.match(LANE, /isRefactor \? "refactor" : "edit"/);
});

test("the planner and the suggester use their own cheap roles", () => {
  assert.match(BRAIN, /"plan", routing/);
  assert.match(BRAIN, /"suggest", routing/);
});

test("the route sanitises before the table reaches a lane", () => {
  assert.match(GEN, /routing: sanitiseRouting\(routing\)/);
});

test("a provider adapter can be told which model to use", () => {
  for (const f of ["anthropic", "openai", "google"]) {
    const src = fs.readFileSync(new URL(`../src/providers/${f}.ts`, import.meta.url), "utf8");
    assert.match(src, /model\?: string/, `${f} ignores the model override`);
    assert.match(src, /model \|\| config\.models/, `${f} does not honour the override`);
  }
});

test("the browser keeps its choices and sends them along", () => {
  assert.match(PAGE, /const ROUTING_KEY = "cp\.routing"/);
  assert.match(PAGE, /localStorage\.setItem\(ROUTING_KEY/);
  assert.match(PAGE, /target: targetId, routing \}/);
});

test("the settings screen shows the reasoning, not just the control", () => {
  // A dropdown with no explanation invites cargo-culting.
  assert.match(PAGE, /Why this tier: /);
  assert.match(PAGE, /function renderModels/);
});

test("an unconfigured provider cannot be selected", () => {
  assert.match(PAGE, /o\.disabled = !p\.configured/);
});
