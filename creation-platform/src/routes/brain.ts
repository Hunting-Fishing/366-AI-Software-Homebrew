// Brain routes — the phase plan for a project.
//
//   POST /api/brain/plan      draft phases from an idea
//   POST /api/brain/advance   after a build: mark progress, suggest next
//
// Both are separate from /api/generate on purpose. Generation is the
// long expensive call; planning is short and cheap, and a planner
// hiccup must never cost the user a build they already paid for. That
// is also why every failure here degrades to "no suggestions" rather
// than an error the user has to read.

import { sanitiseRouting } from "../models.js";
import { Router, type Request, type Response } from "express";
import { planPhases, advance, isBrain, emptyBrain, type Brain } from "../services/brain.js";

export const brainRouter = Router();

brainRouter.post("/api/brain/plan", async (req: Request, res: Response) => {
  const { provider, idea, routing } = req.body as { provider?: string; idea?: string; routing?: unknown };
  if (!provider || !idea) {
    res.status(400).json({ error: "provider and idea are required" });
    return;
  }
  try {
    res.json(await planPhases(provider, idea, sanitiseRouting(routing)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

brainRouter.post("/api/brain/advance", async (req: Request, res: Response) => {
  const { provider, brain, justBuilt, files, routing } = req.body as {
    routing?: unknown;
    provider?: string;
    brain?: unknown;
    justBuilt?: string;
    files?: Array<{ path: string }>;
  };
  if (!provider) {
    res.status(400).json({ error: "provider is required" });
    return;
  }

  const current: Brain = isBrain(brain) ? brain : emptyBrain();
  if (!current.phases.length) {
    // No plan yet — nothing to advance, and nothing worth erroring over.
    res.json({ brain: current, suggestions: [] });
    return;
  }

  try {
    res.json(
      await advance(
        provider,
        current,
        justBuilt ?? "",
        (files ?? []).map((f) => f.path),
        sanitiseRouting(routing)
      )
    );
  } catch {
    // Degrade quietly: the build succeeded, only the planning failed.
    res.json({ brain: current, suggestions: [] });
  }
});
