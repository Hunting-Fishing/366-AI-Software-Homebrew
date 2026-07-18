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
  /** Stream the model's reply as text chunks. */
  stream(
    systemPrompt: string,
    messages: ChatMessage[]
  ): AsyncGenerator<string>;
}

export interface ProviderInfo {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}
