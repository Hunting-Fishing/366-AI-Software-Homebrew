// Live preview routes: run a generated Python app locally and
// show it in the browser. POST starts (replacing any previous
// preview), DELETE stops.

import { Router, type Request, type Response } from "express";
import { previewRunner } from "../services/runner.js";
import type { ProjectFile } from "../lib/files.js";

export const previewRouter = Router();

previewRouter.post("/api/preview", async (req: Request, res: Response) => {
  const { files, kind } = req.body as { files?: ProjectFile[]; kind?: string };
  if (!files || files.length === 0) {
    res.status(400).json({ error: "files are required" });
    return;
  }
  try {
    const { url } =
      kind === "react"
        ? await previewRunner.startReact(files)
        : await previewRunner.start(files);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

previewRouter.delete("/api/preview", (_req: Request, res: Response) => {
  previewRunner.stop();
  res.json({ ok: true });
});
