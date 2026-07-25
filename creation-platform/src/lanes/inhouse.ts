// LANE A — the in-house generation loop.
//
// This is the logic that used to live inline in routes/generate.ts,
// moved behind the AgentLane interface unchanged. Behaviour is
// identical: same prompts, same auto-fix pass, same events.
//
// Strengths: per-target expert prompts (targets.ts), and the only
// lane that understands Godot projects, book pipelines and video
// scene JSON.
//
// Known weakness — the reason Lane B exists: on an edit it re-sends
// the entire project and asks for the entire project back. Cost and
// latency scale with project size, and nothing constrains the model
// to leave untouched files alone.

import { streamGenerate, type ChatMessage } from "../providers/index.js";
import { getTarget } from "../targets.js";
import { extractHtml } from "../lib/extract.js";
import { parseFiles, serializeFiles } from "../lib/files.js";
import { checkProject } from "../lib/check.js";
import type { AgentEvent, AgentLane, LaneRequest } from "./types.js";

export function buildMessages(
  prompt: string,
  currentCode?: string,
  currentFiles?: LaneRequest["files"]
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

export const inhouseLane: AgentLane = {
  id: "inhouse",
  label: "In-house generation loop",

  // Lane A is the fallback for everything. The router only reaches it
  // after more specialised lanes have declined, so it must never say no.
  supports() {
    return true;
  },

  async *run(req: LaneRequest): AsyncGenerator<AgentEvent> {
    const target = getTarget(req.target);
    const messages = buildMessages(req.prompt, req.code, req.files);

    // Stream one model call, relaying chunks; returns the full text.
    async function* runStream(
      msgs: ChatMessage[]
    ): AsyncGenerator<AgentEvent, string> {
      let full = "";
      for await (const text of streamGenerate(req.provider, target.systemPrompt, msgs)) {
        full += text;
        yield { type: "chunk", text };
      }
      return full;
    }

    const full = yield* runStream(messages);

    if (target.mode === "single-html") {
      yield { type: "done", target: target.id, code: extractHtml(full) };
      return;
    }

    let files = parseFiles(full, target.fallbackFile);

    // ── Auto-fix pass (one attempt) ──────────────────────────
    // Check the generated code; if it has errors, show them to the
    // model and stream a corrected version.
    const check = checkProject(target.id, files);
    if (!check.ok) {
      yield { type: "fixing", errors: check.errors };
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
      const fixed = yield* runStream(fixMessages);
      const fixedFiles = parseFiles(fixed, target.fallbackFile);
      if (fixedFiles.length > 0) files = fixedFiles;
    }

    yield { type: "done", target: target.id, files };
  },
};
