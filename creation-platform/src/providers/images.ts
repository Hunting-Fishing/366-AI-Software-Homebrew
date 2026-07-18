// Image-generation gateway — same pattern as the text gateway.
// One function, generateImage(), that can call OpenAI or Google
// image models. Feeds the video studio (character sheets, scene
// keyframes) and later the game pipeline (sprites, textures).
// Anthropic has no image model, so it's not listed here.

const IMAGE_MODELS = {
  openai: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
  google: process.env.GOOGLE_IMAGE_MODEL || "imagen-3.0-generate-002",
};

export interface ImageProviderInfo {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}

async function openaiImage(prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODELS.openai,
      prompt,
      size: "1024x1024",
      n: 1,
    }),
  });
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`OpenAI image error: ${data.error?.message || res.status}`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data");
  return b64;
}

async function googleImage(prompt: string): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${IMAGE_MODELS.google}:predict?key=${process.env.GOOGLE_API_KEY ?? ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    }),
  });
  const data = (await res.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Google image error: ${data.error?.message || res.status}`);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Google returned no image data (Imagen may require a paid AI Studio tier)");
  return b64;
}

const registry: Record<
  string,
  { label: string; keyEnv: string; call: (prompt: string) => Promise<string> }
> = {
  openai: { label: "OpenAI Images", keyEnv: "OPENAI_API_KEY", call: openaiImage },
  google: { label: "Google Imagen", keyEnv: "GOOGLE_API_KEY", call: googleImage },
};

export function availableImageProviders(): ImageProviderInfo[] {
  return Object.entries(registry).map(([id, p]) => ({
    id,
    label: p.label,
    model: IMAGE_MODELS[id as keyof typeof IMAGE_MODELS],
    configured: Boolean(process.env[p.keyEnv]),
  }));
}

/** Generate one image; returns base64-encoded PNG data. */
export async function generateImage(providerId: string, prompt: string): Promise<string> {
  const provider = registry[providerId];
  if (!provider) throw new Error(`Unknown image provider: ${providerId}`);
  if (!process.env[provider.keyEnv]) {
    throw new Error(
      `No API key set for ${provider.label}. Add ${provider.keyEnv} to your .env file.`
    );
  }
  return provider.call(prompt);
}
