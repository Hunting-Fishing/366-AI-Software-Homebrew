// Live preview control.
//
//   POST   /api/preview  → start a run, return IMMEDIATELY
//   GET    /api/preview  → poll: installing | starting | ready | error
//   DELETE /api/preview  → stop
//
// POST used to block for the whole 60–120 seconds a React preview takes
// to install and boot. Behind a proxy that is fatal: Render's edge gives
// up around 100 seconds and returns its own HTML error page, so the
// browser's res.json() failed with "Unexpected token '<'" — an error
// that points nowhere near the real problem. Returning straight away and
// polling removes the long-held request entirely, and lets the UI show
// which phase it is in instead of an unmoving spinner.

import { Router, type Request, type Response } from "express";
import { previewRunner } from "../services/runner.js";
import { runsWithVite } from "../targets.js";
import type { ProjectFile } from "../lib/files.js";

export const previewRouter = Router();

previewRouter.post("/api/preview", (req: Request, res: Response) => {
  const { files, kind, projectId } = req.body as {
    files?: ProjectFile[];
    kind?: string;
    /** Saved project this preview belongs to — scopes its stored data. */
    projectId?: string;
  };
  if (!files || files.length === 0) {
    res.status(400).json({ error: "files are required" });
    return;
  }
  try {
    // 202: accepted, not finished. The browser polls GET from here.
    res.status(202).json(previewRunner.begin(files, runsWithVite(kind ?? ""), projectId ?? "", req.user?.id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

previewRouter.get("/api/preview", (_req: Request, res: Response) => {
  res.json(previewRunner.status());
});

previewRouter.delete("/api/preview", (_req: Request, res: Response) => {
  previewRunner.stop();
  res.json({ ok: true });
});
