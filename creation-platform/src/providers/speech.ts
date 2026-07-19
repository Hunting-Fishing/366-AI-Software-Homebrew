// Speech gateway — text-to-speech for movie narration.
// Uses Gemini TTS with the same GOOGLE_API_KEY. ElevenLabs can
// be added later as a premium adapter with the same shape.
// Returns raw PCM audio (16-bit, 24kHz, mono) — FFmpeg mixes it.

const TTS_MODEL = process.env.GOOGLE_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const VOICE = process.env.GOOGLE_TTS_VOICE || "Kore";

export function speechConfigured(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

interface TtsResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string } }> };
  }>;
  error?: { message?: string };
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("No GOOGLE_API_KEY set — narration uses Gemini TTS.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
        },
      }),
    }
  );
  const data = (await res.json()) as TtsResponse;
  if (!res.ok) throw new Error(`TTS error: ${data.error?.message || res.status}`);
  const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("TTS returned no audio.");
  return Buffer.from(b64, "base64");
}
