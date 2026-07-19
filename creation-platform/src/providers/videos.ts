// Video-generation gateway — image-to-video via Google Veo.
// Veo is a long-running API: start the job, poll until done,
// download the clip. Runway/Kling adapters can be added later
// with the same shape.

const VIDEO_MODEL = process.env.GOOGLE_VIDEO_MODEL || "veo-2.0-generate-001";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface VideoProviderInfo {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}

export function availableVideoProviders(): VideoProviderInfo[] {
  return [
    {
      id: "google-veo",
      label: "Google Veo",
      model: VIDEO_MODEL,
      configured: Boolean(process.env.GOOGLE_API_KEY),
    },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface VeoVideo {
  uri?: string;
  videoBytes?: string;
  bytesBase64Encoded?: string;
}

interface VeoOperation {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: VeoVideo }>;
    };
    generatedVideos?: Array<{ video?: VeoVideo }>;
  };
}

/** Animate one keyframe image into a short clip; returns MP4 bytes. */
export async function generateVideo(
  prompt: string,
  imageB64: string,
  aspect: "16:9" | "9:16" = "16:9"
): Promise<Buffer> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("No GOOGLE_API_KEY set — Veo video generation needs it (and a paid AI Studio tier).");
  }

  // 1. Start the long-running job.
  const startRes = await fetch(
    `${BASE}/models/${VIDEO_MODEL}:predictLongRunning?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            prompt,
            image: { bytesBase64Encoded: imageB64, mimeType: "image/png" },
          },
        ],
        parameters: { aspectRatio: aspect },
      }),
    }
  );
  const started = (await startRes.json()) as VeoOperation;
  if (!startRes.ok) {
    throw new Error(`Veo start failed: ${started.error?.message || startRes.status}`);
  }
  if (!started.name) throw new Error("Veo did not return an operation id.");

  // 2. Poll until done (up to ~4 minutes).
  let op: VeoOperation = started;
  for (let i = 0; i < 48 && !op.done; i++) {
    await sleep(5000);
    const pollRes = await fetch(`${BASE}/${started.name}?key=${key}`);
    op = (await pollRes.json()) as VeoOperation;
    if (op.error) throw new Error(`Veo job failed: ${op.error.message}`);
  }
  if (!op.done) throw new Error("Veo timed out after 4 minutes — try again.");

  // 3. Find the clip (uri or inline bytes — API shape has varied).
  const sample =
    op.response?.generateVideoResponse?.generatedSamples?.[0]?.video ??
    op.response?.generatedVideos?.[0]?.video;
  const inline = sample?.videoBytes ?? sample?.bytesBase64Encoded;
  if (inline) return Buffer.from(inline, "base64");

  const uri = sample?.uri;
  if (!uri) throw new Error("Veo finished but returned no video data.");
  const dl = await fetch(uri + (uri.includes("?") ? "&" : "?") + "key=" + key);
  if (!dl.ok) throw new Error(`Downloading the Veo clip failed (HTTP ${dl.status}).`);
  return Buffer.from(await dl.arrayBuffer());
}
