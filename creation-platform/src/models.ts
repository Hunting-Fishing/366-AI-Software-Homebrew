// Which model does which job.
//
// WHY THIS EXISTS
// One model for everything is the wrong shape. The jobs this platform
// does are genuinely different, and their requirements pull in
// opposite directions:
//
//   Splitting a 700-line file across seven new ones, without breaking
//   a database key, is deep multi-file reasoning. Getting it wrong
//   costs an hour and possibly data.
//
//   Drafting five one-line "what next" suggestions is a paragraph of
//   text. Getting it wrong costs nothing — the user ignores them.
//
// Paying frontier prices and frontier latency for the second is waste;
// using a cheap fast model for the first is how projects break. So the
// work is split into roles, each role has a default tier, and every
// one of them is overridable.
//
// MODEL NAMES — verified July 2026, and deliberately overridable
// Model names move faster than any codebase. Every id here can be
// replaced from the environment without a code change, because the
// alternative is that a release somewhere else breaks this platform
// and the fix requires a deploy.

import type { ProviderId } from "./config.js";

/** A distinct job, with its own accuracy and cost profile. */
export type Role =
  | "create"    // first build, from nothing
  | "edit"      // a normal change to an existing project
  | "fix"       // repair a specific error
  | "refactor"  // split a file without breaking its contracts
  | "plan"      // draft the phase plan
  | "suggest"   // propose the next few prompts
  | "name";     // name a project, label a version

/** How much model a role is worth. */
export type Tier = "deep" | "balanced" | "fast";

export interface RoleSpec {
  id: Role;
  label: string;
  /** What the job actually is. */
  what: string;
  /** Why it gets this tier — the reasoning, so a user can disagree well. */
  why: string;
  defaultTier: Tier;
}

export const ROLES: RoleSpec[] = [
  {
    id: "create",
    label: "First build",
    what: "Turning a description into a whole working project — every file, from nothing.",
    why: "The most open-ended job there is, and everything afterwards inherits its structure. A weak first build is paid for on every edit that follows.",
    defaultTier: "deep",
  },
  {
    id: "edit",
    label: "Everyday changes",
    what: "Adding a field, changing a layout, adjusting behaviour in a project that already works.",
    why: "Most prompts land here. The context is already written and the change is usually local, so a mid-tier model is both accurate enough and noticeably faster — which matters when you are iterating.",
    defaultTier: "balanced",
  },
  {
    id: "fix",
    label: "Fixing errors",
    what: "Reading an error, finding the actual cause, and repairing it.",
    why: "Root-cause debugging is where cheaper models guess. A wrong guess here does not just fail — it edits the wrong file and leaves you further from working than before.",
    defaultTier: "deep",
  },
  {
    id: "refactor",
    label: "Splitting large files",
    what: "Breaking a long file into smaller ones without losing a route, a storage key or an export.",
    why: "The highest-risk edit the platform makes. It moves many things at once, and a mistake is silent — the app still runs and a database key is spelled differently. Never economise here.",
    defaultTier: "deep",
  },
  {
    id: "plan",
    label: "Build plan",
    what: "Drafting the phases a project will go through.",
    why: "Short structured output over a short prompt. Speed matters more than depth, because it runs while you are waiting to start.",
    defaultTier: "fast",
  },
  {
    id: "suggest",
    label: "Next-step suggestions",
    what: "Proposing the next few prompts worth sending.",
    why: "A handful of one-line ideas. Cheap and fast is exactly right: a mediocre suggestion costs nothing because you simply do not click it.",
    defaultTier: "fast",
  },
  {
    id: "name",
    label: "Naming",
    what: "Naming a project, labelling a version.",
    why: "A few words. Any current model does this perfectly; paying more is pure waste.",
    defaultTier: "fast",
  },
];

export interface TierSpec {
  id: Tier;
  label: string;
  blurb: string;
}

export const TIERS: TierSpec[] = [
  { id: "deep", label: "Deep", blurb: "Slowest and dearest. Best at multi-file reasoning and finding root causes." },
  { id: "balanced", label: "Balanced", blurb: "The everyday choice. Strong enough for most edits, much quicker." },
  { id: "fast", label: "Fast", blurb: "Cheapest and quickest. Fine for short, low-stakes output." },
];

/**
 * The model behind each provider/tier pair.
 *
 * Verified against provider documentation in July 2026. Every entry is
 * overridable — see envKey() — because these names change on somebody
 * else's schedule and a rename must never require a deploy here.
 */
export const MODELS: Record<ProviderId, Record<Tier, string>> = {
  anthropic: {
    deep: "claude-opus-5",
    balanced: "claude-sonnet-5",
    fast: "claude-haiku-4-5-20251001",
  },
  openai: {
    // The GPT-5.6 family: Sol flagship, Terra mid, Luna fastest.
    deep: "gpt-5.6-sol",
    balanced: "gpt-5.6-terra",
    fast: "gpt-5.6-luna",
  },
  google: {
    // 3.6 Flash is the current coding default; Flash-Lite is the
    // cheap tier.
    deep: "gemini-3.6-flash",
    balanced: "gemini-3.5-flash",
    fast: "gemini-3.5-flash-lite",
  },
};

/** ANTHROPIC_MODEL_DEEP, OPENAI_MODEL_FAST, and so on. */
export function envKey(provider: string, tier: Tier): string {
  return `${provider.toUpperCase()}_MODEL_${tier.toUpperCase()}`;
}

export function modelForTier(provider: string, tier: Tier): string {
  const override = process.env[envKey(provider, tier)];
  if (override) return override;
  const table = MODELS[provider as ProviderId];
  return table?.[tier] ?? table?.balanced ?? "";
}

/** A user's choice for one role. Absent fields fall back to the default. */
export interface RoleChoice {
  provider?: string;
  tier?: Tier;
}

export type Routing = Partial<Record<Role, RoleChoice>>;

export function roleSpec(role: Role): RoleSpec {
  return ROLES.find((r) => r.id === role) ?? ROLES[1]!;
}

/**
 * Resolve a role to a concrete provider and model.
 *
 * `fallbackProvider` is whatever the user picked in the header, so an
 * untouched routing table behaves exactly as before: one provider,
 * with tiers chosen per job.
 */
export function resolve(
  role: Role,
  fallbackProvider: string,
  routing: Routing = {}
): { provider: string; tier: Tier; model: string } {
  const choice = routing[role] ?? {};
  const provider = choice.provider || fallbackProvider;
  const tier = choice.tier || roleSpec(role).defaultTier;
  return { provider, tier, model: modelForTier(provider, tier) };
}

/** The whole table, for the settings UI and for /api/health. */
export function routingPlan(fallbackProvider: string, routing: Routing = {}) {
  return ROLES.map((r) => ({
    ...r,
    ...resolve(r.id, fallbackProvider, routing),
    overridden: Boolean(routing[r.id]?.provider || routing[r.id]?.tier),
  }));
}

/** Reject anything that is not a real role, tier or provider id. */
export function sanitiseRouting(input: unknown): Routing {
  if (!input || typeof input !== "object") return {};
  const roles = new Set(ROLES.map((r) => r.id as string));
  const tiers = new Set(TIERS.map((t) => t.id as string));
  const providers = new Set(Object.keys(MODELS));
  const out: Routing = {};

  for (const [role, value] of Object.entries(input as Record<string, unknown>)) {
    if (!roles.has(role) || !value || typeof value !== "object") continue;
    const v = value as { provider?: unknown; tier?: unknown };
    const choice: RoleChoice = {};
    if (typeof v.provider === "string" && providers.has(v.provider)) choice.provider = v.provider;
    if (typeof v.tier === "string" && tiers.has(v.tier)) choice.tier = v.tier as Tier;
    if (choice.provider || choice.tier) out[role as Role] = choice;
  }
  return out;
}
