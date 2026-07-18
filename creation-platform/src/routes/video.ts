// Movie routes: animate one keyframe into a clip (Veo), and
// assemble clips into the final film (FFmpeg).

import { Router, type Request, type Response } from "express";
import { generateVideo } from "../providers/videos.js";
import { saveClip, assemble } from "../services/studio.js";

export const videoRouter = Router();

// POST /api/video/animate { scene, prompt, imageB64 } → { file }
videoRouter.post("/api/video/animate", async (req: Request, res: Response) => {
  const { scene, prompt, imageB64 } = req.body as {
    scene?: string | number;
    prompt?: string;
    imageB64?: string;
  };
  if (!prompt || !imageB64) {
    res.status(400).json({ error: "prompt and imageB64 are required" });
    return;
  }
  try {
    const clip = await generateVideo(prompt, imageB64);
    const file = saveClip(`scene-${scene ?? "x"}-${Date.now()}.mp4`, clip);
    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/video/assemble { files: ["/media/scene-1-...mp4", ...] } → { file }
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
