// POST /api/publish — put a generated app on the public web.
// Body: { name, code } (web apps)  or  { name, files } (static multi-file).
// Returns: { url }

import { Router, type Request, type Response } from "express";
import { deploySite } from "../services/deploy.js";
import type { ProjectFile } from "../lib/files.js";

export const publishRouter = Router();

publishRouter.post("/api/publish", async (req: Request, res: Response) => {
  const { name, code, files, kind } = req.body as {
    name?: string;
    code?: string;
    files?: ProjectFile[];
    kind?: string;
  };

  let toDeploy: ProjectFile[] = code
    ? [{ path: "index.html", content: code }]
    : files ?? [];

  // React projects get built first; the optimized dist/ is deployed.
  if (kind === "react" && files && files.length > 0) {
    const { buildReact } = await import("../services/build.js");
    try {
      toDeploy = await buildReact(files);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
  }

  if (toDeploy.length === 0) {
    res.status(400).json({ error: "code or files are required" });
    return;
  }
  try {
    const { url } = await deploySite(name ?? "my-app", toDeploy);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
