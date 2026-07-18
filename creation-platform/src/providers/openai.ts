import { config } from "../config.js";
import { sseData, apiError } from "../lib/sse.js";
import type { ProviderAdapter, ChatMessage } from "./types.js";

// OpenAI streaming chunk:
// {"choices":[{"delta":{"content":"..."}}]}  ...  data: [DONE]
interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export const openai: ProviderAdapter = {
  id: "openai",
  label: "ChatGPT (OpenAI)",
  keyEnv: "OPENAI_API_KEY",

  async *stream(systemPrompt: string, messages: ChatMessage[]) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: config.models.openai,
        max_tokens: config.maxTokens,
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    if (!res.ok) throw await apiError("OpenAI", res);

    for await (const payload of sseData(res)) {
      if (payload === "[DONE]") return;
      const chunk = JSON.parse(payload) as OpenAIChunk;
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  },
};
