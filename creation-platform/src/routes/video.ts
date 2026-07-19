// Movie routes: shot-list design (LLM), animate keyframes (Veo),
// assemble clips (FFmpeg).

import { Router, type Request, type Response } from "express";
import { generateVideo } from "../providers/videos.js";
import { saveClip, assemble } from "../services/studio.js";
import { streamGenerate } from "../providers/index.js";
import { extractJsonArray } from "../lib/extract.js";

export const videoRouter = Router();

// POST /api/video/shotlist { provider, description, style, count }
// → { shots: [{ title, prompt }] }
// Turns "what should happen" into one motion prompt per photo/scene.
const SHOTLIST_SYSTEM = `You are an expert film director designing image-to-video motion prompts.
The user gives you a story idea, a visual style, and a number of shots. Each shot will animate ONE still photo/keyframe (6-8 seconds).
Respond with ONLY a JSON array of exactly the requested number of objects, each: {"title": "short shot name", "prompt": "detailed motion prompt"}.
Each prompt must: describe camera movement and subject motion only (the image already defines the look), match the requested style exactly, keep continuity so the shots tell one story in order, and never introduce characters or objects that could not be in the photo.`;

videoRouter.post("/api/video/shotlist", async (req: Request, res: Response) => {
  const { provider, description, style, count } = req.body as {
    provider?: string;
    description?: string;
    style?: string;
    count?: number;
  };
  if (!provider || !description || !count) {
    res.status(400).json({ error: "provider, description and count are required" });
    return;
  }
  try {
    let full = "";
    const stream = streamGenerate(provider, SHOTLIST_SYSTEM, [
      {
        role: "user",
        content:
          `Story: ${description}\nStyle: ${style || "cinematic"}\nNumber of shots: ${count}\n` +
          `Output the JSON array now.`,
      },
    ]);
    for await (const text of stream) full += text;
    const shots = extractJsonArray(full) as Array<{ title?: string; prompt?: string }>;
    res.json({
      shots: shots.slice(0, count).map((s, i) => ({
        title: s.title || `Shot ${i + 1}`,
        prompt: s.prompt || "",
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/video/animate { scene, prompt, imageB64, aspect } → { file }
videoRouter.post("/api/video/animate", async (req: Request, res: Response) => {
  const { scene, prompt, imageB64, aspect } = req.body as {
    scene?: string | number;
    prompt?: string;
    imageB64?: string;
    aspect?: string;
  };
  if (!prompt || !imageB64) {
    res.status(400).json({ error: "prompt and imageB64 are required" });
    return;
  }
  try {
    const ratio = aspect === "9:16" ? "9:16" : "16:9";
    const clip = await generateVideo(prompt, imageB64, ratio);
    const file = saveClip(`scene-${scene ?? "x"}-${Date.now()}.mp4`, clip);
    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/video/motion { images:[{id,b64}], aspect } → { file }
// IN-HOUSE movie generation: our own FFmpeg motion engine, no
// external video API, free.
videoRouter.post("/api/video/motion", async (req: Request, res: Response) => {
  const { images, aspect } = req.body as {
    images?: Array<{ id: string | number; b64: string }>;
    aspect?: string;
  };
  if (!images || images.length === 0) {
    res.status(400).json({ error: "images are required" });
    return;
  }
  try {
    const { kenBurnsMovie } = await import("../services/motion.js");
    const ratio = aspect === "9:16" ? ("9:16" as const) : ("16:9" as const);
    const file = await kenBurnsMovie(images, ratio);
    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/video/music { file, musicB64, ext } → { file }
// Mixes a user-supplied music file under the movie (in-house).
videoRouter.post("/api/video/music", async (req: Request, res: Response) => {
  const { file, musicB64, ext } = req.body as { file?: string; musicB64?: string; ext?: string };
  if (!file || !musicB64) {
    res.status(400).json({ error: "file and musicB64 are required" });
    return;
  }
  try {
    const { mixMusic } = await import("../services/studio.js");
    const out = await mixMusic(file, Buffer.from(musicB64, "base64"), ext || "mp3");
    res.json({ file: out });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/video/voiceover { file, text } → { file }
// Adds AI narration (Gemini TTS) to a finished movie.
videoRouter.post("/api/video/voiceover", async (req: Request, res: Response) => {
  const { file, text } = req.body as { file?: string; text?: string };
  if (!file || !text) {
    res.status(400).json({ error: "file and text are required" });
    return;
  }
  try {
    const { synthesizeSpeech } = await import("../providers/speech.js");
    const { mixVoiceover } = await import("../services/studio.js");
    const pcm = await synthesizeSpeech(text);
    const out = await mixVoiceover(file, pcm);
    res.json({ file: out });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/video/assemble { files } → { file }
videoRouter.post("/api/video/assemble", async (req: Request, res: Response) => {
  const { files } = req.body as { files?: string[] };
  if (!files || files.length === 0) {
    res.status(400).json({ error: "files are required" });
    return;
  }
  try {
    const file = await assemble(files);
    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
