// POST /api/image — generate one image via the image gateway.
// Body: { provider, prompt } → { b64 } (PNG, base64).

import { Router, type Request, type Response } from "express";
import { generateImage } from "../providers/images.js";

export const imageRouter = Router();

imageRouter.post("/api/image", async (req: Request, res: Response) => {
  const { provider, prompt } = req.body as { provider?: string; prompt?: string };
  if (!provider || !prompt) {
    res.status(400).json({ error: "provider and prompt are required" });
    return;
  }
  try {
    const b64 = await generateImage(provider, prompt);
    res.json({ b64 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
