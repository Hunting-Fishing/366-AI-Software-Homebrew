// Project CRUD routes, backed by any ProjectStore implementation.

import { Router, type Request, type Response } from "express";
import type { ProjectStore } from "../services/projects.js";

export function projectsRouter(store: ProjectStore): Router {
  const router = Router();

  router.post("/api/projects", (req: Request, res: Response) => {
    const { name, code, prompt, target, files } = req.body as {
      name?: string;
      code?: string;
      prompt?: string;
      target?: string;
      files?: Array<{ path: string; content: string }>;
    };
    const hasContent = Boolean(code) || (files && files.length > 0);
    if (!name || !hasContent) {
      res.status(400).json({ error: "name and code (or files) are required" });
      return;
    }
    const project = store.save(name, prompt ?? "", code ?? "", target, files);
    res.json({ id: project.id });
  });

  router.get("/api/projects", (_req: Request, res: Response) => {
    res.json(store.list());
  });

  router.get("/api/projects/:id", (req: Request, res: Response) => {
    const project = store.get(req.params.id ?? "");
    if (!project) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(project);
  });

  return router;
}
