// The contract every AI provider adapter must fulfil.
// Adding a new provider = one file implementing this interface
// + one line in providers/index.ts.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderAdapter {
  id: string;
  label: string;
  keyEnv: string; // which .env variable holds the API key
  /**
   * Stream the model's reply as text chunks.
   *
   * `model` overrides the provider's default. It exists so one
   * provider can serve several tiers — see src/models.ts, where the
   * job decides how much model it is worth.
   */
  stream(
    systemPrompt: string,
    messages: ChatMessage[],
    model?: string
  ): AsyncGenerator<string>;
}

export interface ProviderInfo {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}
