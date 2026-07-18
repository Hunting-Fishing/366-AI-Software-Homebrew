// The Multi-LLM Gateway. Everything in the platform (app
// builder today; game tools and video studio later) talks to
// AI models through this one module.

import { config } from "../config.js";
import { anthropic } from "./anthropic.js";
import { openai } from "./openai.js";
import { google } from "./google.js";
import type { ChatMessage, ProviderAdapter, ProviderInfo } from "./types.js";

const registry: Record<string, ProviderAdapter> = {
  [anthropic.id]: anthropic,
  [openai.id]: openai,
  [google.id]: google,
  // Add future providers here (one adapter file + one line).
};

export function availableProviders(): ProviderInfo[] {
  return Object.values(registry).map((p) => ({
    id: p.id,
    label: p.label,
    model: config.models[p.id as keyof typeof config.models] ?? "unknown",
    configured: Boolean(process.env[p.keyEnv]),
  }));
}

/** Stream a reply from the chosen provider as text chunks. */
export function streamGenerate(
  providerId: string,
  systemPrompt: string,
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const provider = registry[providerId];
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  if (!process.env[provider.keyEnv]) {
    throw new Error(
      `No API key set for ${provider.label}. Add ${provider.keyEnv} to your .env file and restart.`
    );
  }
  return provider.stream(systemPrompt, messages);
}

export type { ChatMessage };
