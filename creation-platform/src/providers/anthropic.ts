import { config } from "../config.js";
import { sseData, apiError } from "../lib/sse.js";
import type { ProviderAdapter, ChatMessage } from "./types.js";

// Anthropic streaming event we care about:
// {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
interface AnthropicEvent {
  type: string;
  delta?: { type: string; text?: string };
  error?: { message?: string };
}

export const anthropic: ProviderAdapter = {
  id: "anthropic",
  label: "Claude (Anthropic)",
  keyEnv: "ANTHROPIC_API_KEY",

  async *stream(systemPrompt: string, messages: ChatMessage[]) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.models.anthropic,
        max_tokens: config.maxTokens,
        stream: true,
        system: systemPrompt,
        messages,
      }),
    });
    if (!res.ok) throw await apiError("Anthropic", res);

    for await (const payload of sseData(res)) {
      const event = JSON.parse(payload) as AnthropicEvent;
      if (event.type === "content_block_delta" && event.delta?.text) {
        yield event.delta.text;
      }
      if (event.type === "error") {
        throw new Error(`Anthropic stream error: ${event.error?.message}`);
      }
    }
  },
};
