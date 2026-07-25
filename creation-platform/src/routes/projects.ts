// Project CRUD routes, backed by any ProjectStore implementation.

import { Router, type Request, type Response } from "express";
import type { ProjectStore } from "../services/projects.js";

export function projectsRouter(store: ProjectStore): Router {
  const router = Router();

  router.post("/api/projects", async (req: Request, res: Response) => {
    const { name, code, prompt, target, files, binaries } = req.body as {
      name?: string;
      code?: string;
      prompt?: string;
      target?: string;
      files?: Array<{ path: string; content: string }>;
      binaries?: Array<{ path: string; b64: string }>;
    };
    const hasContent = Boolean(code) || (files && files.length > 0);
    if (!name || !hasContent) {
      res.status(400).json({ error: "name and code (or files) are required" });
      return;
    }
    try {
      const project = await store.save(name, prompt ?? "", code ?? "", target, files, binaries, req.user?.id);
      res.json({ id: project.id });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/api/projects", async (req: Request, res: Response) => {
    try {
      res.json(await store.list(req.user?.id));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/api/projects/:id", async (req: Request, res: Response) => {
    const project = await store.get(req.params.id ?? "", req.user?.id);
    if (!project) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(project);
  });

  // ── version history ──────────────────────────────────────
  // Saving over an existing project keeps its id and appends a
  // version, rather than creating a duplicate project as a bare
  // POST /api/projects does.

  router.put("/api/projects/:id", async (req: Request, res: Response) => {
    const { name, code, prompt, target, files, binaries, label } = req.body as {
      name?: string;
      code?: string;
      prompt?: string;
      target?: string;
      files?: Array<{ path: string; content: string }>;
      binaries?: Array<{ path: string; b64: string }>;
      label?: string;
    };
    try {
      const project = await store.update(
        req.params.id ?? "",
        { name, code, prompt, target, files, binaries, label },
        req.user?.id
      );
      if (!project) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json({ id: project.id, savedAt: project.savedAt });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/api/projects/:id/versions", async (req: Request, res: Response) => {
    try {
      res.json(await store.listVersions(req.params.id ?? "", req.user?.id));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/api/projects/:id/versions/:n", async (req: Request, res: Response) => {
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1) {
      res.status(400).json({ error: "version must be a positive integer" });
      return;
    }
    try {
      const project = await store.getVersion(req.params.id ?? "", n, req.user?.id);
      if (!project) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Restoring is itself a new version, so it can be undone.
  router.post("/api/projects/:id/restore/:n", async (req: Request, res: Response) => {
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1) {
      res.status(400).json({ error: "version must be a positive integer" });
      return;
    }
    try {
      const project = await store.restoreVersion(req.params.id ?? "", n, req.user?.id);
      if (!project) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.json(project);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
