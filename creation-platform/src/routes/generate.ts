// POST /api/generate — streams the generation to the browser over SSE.
// Events:  {type:"chunk", text}
//          {type:"fixing", errors}                (auto-fix loop kicked in)
//          {type:"done", target, code}            (single-html targets)
//          {type:"done", target, files:[...]}     (multi-file targets)
//          {type:"error", message} on failure.
//
// The generation logic itself now lives behind the AgentLane seam in
// src/lanes/. This route only does HTTP: validate, pick a lane, relay
// its events, frame failures. The wire format is unchanged — the
// browser code in public/index.html needs no edits.

import { Router, type Request, type Response } from "express";
import { runLane, modeOf, selectLane } from "../lanes/index.js";
import type { WireEvent } from "../lanes/index.js";
import type { ProjectFile } from "../lib/files.js";

export const generateRouter = Router();

generateRouter.post("/api/generate", async (req: Request, res: Response) => {
  const { provider, prompt, target: targetId, currentCode, currentFiles } =
    req.body as {
      provider?: string;
      prompt?: string;
      target?: string;
      currentCode?: string;
      currentFiles?: ProjectFile[];
    };

  if (!provider || !prompt) {
    res.status(400).json({ error: "provider and prompt are required" });
    return;
  }

  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const send = (event: WireEvent) =>
    res.write("data: " + JSON.stringify(event) + "\n\n");

  const laneReq = {
    prompt,
    target: targetId ?? "web",
    provider,
    files: currentFiles ?? [],
    code: currentCode,
  };

  try {
    // Logged, not sent — the frontend knows nothing about lanes, and
    // this line is how you tell which lane handled a given request.
    const mode = modeOf(laneReq);
    const lane = selectLane(laneReq.target, mode);
    console.log(
      `[generate] target=${laneReq.target} mode=${mode} lane=${lane.id}`
    );

    for await (const event of runLane(laneReq)) {
      send(event);
    }
  } catch (err) {
    send({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
  }
});
