import { config } from "../config.js";
import { sseData, apiError } from "../lib/sse.js";
import type { ProviderAdapter, ChatMessage } from "./types.js";

// Gemini streaming chunk:
// {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
// Using a Google AI Studio key. To move to Vertex AI later,
// swap the URL for the Vertex endpoint and use OAuth — the
// payload shape stays the same.
interface GeminiChunk {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export const google: ProviderAdapter = {
  id: "google",
  label: "Gemini (Google)",
  keyEnv: "GOOGLE_API_KEY",

  async *stream(systemPrompt: string, messages: ChatMessage[]) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${config.models.google}:streamGenerateContent?alt=sse&key=${process.env.GOOGLE_API_KEY ?? ""}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: config.maxTokens },
      }),
    });
    if (!res.ok) throw await apiError("Google", res);

    for await (const payload of sseData(res)) {
      const chunk = JSON.parse(payload) as GeminiChunk;
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) yield part.text;
      }
    }
  },
};
