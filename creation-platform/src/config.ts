// Central configuration. Model names and output ceilings can be
// overridden in .env so new model releases never require a code change.

/** Read a positive integer from the environment, or fall back. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const config = {
  port: envInt("PORT", 3000),

  models: {
    anthropic: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    openai: process.env.OPENAI_MODEL || "gpt-4.1",
    google: process.env.GOOGLE_MODEL || "gemini-2.5-pro",
  },

  // ── Output ceilings, per provider ────────────────────────────
  // This used to be ONE global 16000 shared by all three providers.
  // That number sits far below what every current model supports, and
  // it truncated silently: a multi-file project needing more than 16k
  // output tokens simply lost its trailing files, with no error raised
  // and nothing shown to the user.
  //
  // Defaults are each model's documented maximum output:
  //   claude-sonnet-4-5   64,000
  //   gpt-4.1             32,768
  //   gemini-2.5-pro      65,536
  //
  // IMPORTANT: if you override a model above, check its ceiling and
  // override the matching *_MAX_TOKENS too. Asking for more output than
  // a model supports is a hard API error, not a silent clamp.
  maxTokens: {
    anthropic: envInt("ANTHROPIC_MAX_TOKENS", 64000),
    openai: envInt("OPENAI_MAX_TOKENS", 32768),
    google: envInt("GOOGLE_MAX_TOKENS", 65536),
  },
} as const;

export type ProviderId = keyof typeof config.models;

/**
 * Output ceiling for a provider id. Falls back to the old conservative
 * 16000 for any provider added later that forgets to declare one.
 */
export function maxTokensFor(provider: string): number {
  const table = config.maxTokens as Record<string, number | undefined>;
  return table[provider] ?? 16000;
}

// System prompts now live per-target in src/targets.ts --
// each language (Web, Flutter, Python, ...) has its own expert
// instructions. Iterate on those constantly.
