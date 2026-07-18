// POST /api/generate — streams the generation to the browser over SSE.
// Events:  {type:"chunk", text}
//          {type:"fixing", errors}                (auto-fix loop kicked in)
//          {type:"done", target, code}            (single-html targets)
//          {type:"done", target, files:[...]}     (multi-file targets)
//          {type:"error", message} on failure.

import { Router, type Request, type Response } from "express";
import { streamGenerate, type ChatMessage } from "../providers/index.js";
import { getTarget } from "../targets.js";
import { extractHtml } from "../lib/extract.js";
import { parseFiles, serializeFiles, type ProjectFile } from "../lib/files.js";
import { checkProject } from "../lib/check.js";

export const generateRouter = Router();

function buildMessages(
  prompt: string,
  currentCode?: string,
  currentFiles?: ProjectFile[]
): ChatMessage[] {
  const existing =
    currentFiles && currentFiles.length > 0
      ? serializeFiles(currentFiles)
      : currentCode;

  if (existing) {
    return [
      { role: "user", content: "Here is my current project:\n\n" + existing },
      { role: "assistant", content: "Understood. What would you like to change?" },
      { role: "user", content: prompt },
    ];
  }
  return [{ role: "user", content: "Build this: " + prompt }];
}

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
  const target = getTarget(targetId);

  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const send = (event: object) => res.write("data: " + JSON.stringify(event) + "\n\n");

  // Stream one model call, relaying chunks; returns the full text.
  async function runStream(messages: ChatMessage[]): Promise<string> {
    let full = "";
    const stream = streamGenerate(provider!, target.systemPrompt, messages);
    for await (const text of stream) {
      full += text;
      send({ type: "chunk", text });
    }
    return full;
  }

  try {
    const messages = buildMessages(prompt, currentCode, currentFiles);
    const full = await runStream(messages);

    if (target.mode === "single-html") {
      send({ type: "done", target: target.id, code: extractHtml(full) });
      return;
    }

    let files = parseFiles(full, target.fallbackFile);

    // ---- AUTO-FIX LOOP (one attempt) --------------------------
    // Check the generated code; if it has errors, show them to
    // the model and stream a corrected version.
    const check = checkProject(target.id, files);
    if (!check.ok) {
      send({ type: "fixing", errors: check.errors });
      const fixMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: full },
        {
          role: "user",
          content:
            "Your code has errors. Fix them and output the corrected COMPLETE project " +
            "(every file, same ===FILE: format). Errors:\n\n" + check.errors,
        },
      ];
      const fixed = await runStream(fixMessages);
      const fixedFiles = parseFiles(fixed, target.fallbackFile);
      if (fixedFiles.length > 0) files = fixedFiles;
    }

    send({ type: "done", target: target.id, files });
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
});
