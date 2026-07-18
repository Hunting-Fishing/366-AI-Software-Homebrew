// Central configuration. Model names can be overridden in .env
// so new model releases never require a code change.

export const config = {
  port: Number(process.env.PORT) || 3000,
  maxTokens: 16000,
  models: {
    anthropic: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    openai: process.env.OPENAI_MODEL || "gpt-4.1",
    google: process.env.GOOGLE_MODEL || "gemini-2.5-pro",
  },
} as const;

// System prompts now live per-target in src/targets.ts --
// each language (Web, Flutter, Python, ...) has its own expert
// instructions. Iterate on those constantly.
