// ============================================================
// providers.js — The Multi-LLM Gateway
// ============================================================
// One function, generate(), that can talk to Claude, OpenAI,
// or Google Gemini. Every product you build (app builder, game
// tools, video studio) calls this same module.
//
// To add a NEW provider later: copy one of the adapter
// functions below, change the URL + payload shape, and add it
// to the PROVIDERS table at the bottom. That's it.
// ============================================================

// ---- Model configuration ----------------------------------
// When new models come out, just change the names here.
const MODELS = {
  anthropic: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  openai: process.env.OPENAI_MODEL || "gpt-4.1",
  google: process.env.GOOGLE_MODEL || "gemini-2.5-pro",
};

const MAX_TOKENS = 16000; // generated apps can be long

// ---- Adapter: Anthropic (Claude) --------------------------
async function callAnthropic(systemPrompt, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.anthropic,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic error: ${data.error?.message || res.status}`);
  return data.content.map((c) => c.text || "").join("");
}

// ---- Adapter: OpenAI (ChatGPT) ----------------------------
async function callOpenAI(systemPrompt, messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELS.openai,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${data.error?.message || res.status}`);
  return data.choices[0].message.content;
}

// ---- Adapter: Google (Gemini) -----------------------------
// Uses a Google AI Studio key (simplest). To switch to Vertex AI
// later, change the URL to the Vertex endpoint and use OAuth —
// the payload shape below stays the same.
async function callGoogle(systemPrompt, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.google}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: MAX_TOKENS },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google error: ${data.error?.message || res.status}`);
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

// ---- Provider registry ------------------------------------
const PROVIDERS = {
  anthropic: { call: callAnthropic, keyEnv: "ANTHROPIC_API_KEY", label: "Claude (Anthropic)" },
  openai: { call: callOpenAI, keyEnv: "OPENAI_API_KEY", label: "ChatGPT (OpenAI)" },
  google: { call: callGoogle, keyEnv: "GOOGLE_API_KEY", label: "Gemini (Google)" },
};

// Which providers have keys configured? (Shown in the UI.)
function availableProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    model: MODELS[id],
    configured: Boolean(process.env[p.keyEnv]),
  }));
}

// The one function everything else uses.
async function generate(providerId, systemPrompt, messages) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  if (!process.env[provider.keyEnv]) {
    throw new Error(
      `No API key set for ${provider.label}. Add ${provider.keyEnv} to your .env file.`
    );
  }
  return provider.call(systemPrompt, messages);
}

module.exports = { generate, availableProviders };
