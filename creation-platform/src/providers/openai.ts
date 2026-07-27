import { config, maxTokensFor } from "../config.js";
import { sseData, apiError } from "../lib/sse.js";
import type { ProviderAdapter, ChatMessage } from "./types.js";

// OpenAI streaming chunk:
// {"choices":[{"delta":{"content":"..."}}]}  ...  data: [DONE]
interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Which token-limit parameter this model accepts.
 *
 * `max_tokens` is deprecated and REJECTED outright by the reasoning
 * models — which is every model this platform now defaults to. Sending
 * the wrong one is not a soft failure: the request 400s before the
 * model is reached, so every OpenAI build failed with an error about a
 * parameter rather than anything to do with the code.
 *
 * Reasoning models also count their hidden thinking tokens against
 * this budget, which is the reason for the separate name: it is a cap
 * on everything generated, not just on what comes back.
 */
export function tokenParam(model: string): "max_completion_tokens" | "max_tokens" {
  return /^(gpt-5|o[1-9])/i.test(model) ? "max_completion_tokens" : "max_tokens";
}

/** Turn OpenAI's rejection into something a person can act on. */
function explain(model: string, raw: string): string {
  if (/does not exist|Unrecognized model|model_not_found/i.test(raw)) {
    return (
      `OpenAI does not recognise the model "${model}". Model names change; ` +
      `set OPENAI_MODEL_DEEP / OPENAI_MODEL_BALANCED / OPENAI_MODEL_FAST in ` +
      `your environment to whatever your account actually has, and restart. ` +
      `Original error: ${raw}`
    );
  }
  if (/max_completion_tokens|max_tokens/i.test(raw) && /less than|maximum|exceed/i.test(raw)) {
    return (
      `The output limit is higher than this model allows. Lower OPENAI_MAX_TOKENS ` +
      `and restart. Original error: ${raw}`
    );
  }
  if (/insufficient_quota|billing|exceeded your current quota/i.test(raw)) {
    return `The OpenAI account is out of credit. Original error: ${raw}`;
  }
  return raw;
}

export const openai: ProviderAdapter = {
  id: "openai",
  label: "ChatGPT (OpenAI)",
  keyEnv: "OPENAI_API_KEY",

  async *stream(systemPrompt: string, messages: ChatMessage[], model?: string) {
    const id = model || config.models.openai;

    // One retry with the other parameter name. The rule above is right
    // for every model documented today, but model families are not
    // ours to control, and a build failing on a parameter name is a
    // maddening way to lose work.
    const attempt = async (param: "max_completion_tokens" | "max_tokens") =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model: id,
          [param]: maxTokensFor("openai"),
          stream: true,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
      });

    const first = tokenParam(id);
    let res = await attempt(first);

    if (!res.ok) {
      const body = await res.clone().text();
      if (/max_completion_tokens|max_tokens|Unsupported parameter|Unrecognized request argument/i.test(body)) {
        res = await attempt(first === "max_tokens" ? "max_completion_tokens" : "max_tokens");
      }
    }

    if (!res.ok) {
      const err = await apiError("OpenAI", res);
      throw new Error(explain(id, err instanceof Error ? err.message : String(err)));
    }

    for await (const payload of sseData(res)) {
      if (payload === "[DONE]") return;
      const chunk = JSON.parse(payload) as OpenAIChunk;
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  },
};
