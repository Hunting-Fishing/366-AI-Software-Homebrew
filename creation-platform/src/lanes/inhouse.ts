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
import { parseFiles, serializeFiles, type ProjectFile } from "../lib/files.js";
import { checkProject, type CheckResult } from "../lib/check.js";
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
    //
    // THIS PASS USED TO MAKE THINGS WORSE.
    // The retry's output was accepted on one condition: that it
    // contained at least one file. It was never re-checked. So a
    // truncated or partial correction silently REPLACED a working
    // project with a broken one — and the user was told "Updated!".
    //
    // That is exactly how RestoBar Manager lost src/App.jsx: the file
    // was present through version 10, the retry at version 11 came
    // back without it, and five further builds were made on top of a
    // project whose entry module imported a file that did not exist.
    //
    // A correction is now only accepted if it is actually better.
    const check = checkProject(target.id, files);
    let residual = check;

    if (!check.ok) {
      yield { type: "fixing", errors: check.errors };
      const fixMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: full },
        {
          role: "user",
          content:
            "Your code has errors. Fix them and output the corrected COMPLETE project — " +
            "every file, including the ones that were already correct, in the same " +
            "===FILE: format. Anything you leave out will be DELETED from the project, " +
            "so a partial answer breaks the build.\n\nErrors:\n\n" + check.errors,
        },
      ];
      const fixed = yield* runStream(fixMessages);
      const fixedFiles = parseFiles(fixed, target.fallbackFile);

      const verdict = betterOf(target.id, files, fixedFiles);
      files = verdict.files;
      residual = verdict.check;
      if (verdict.lost.length) {
        // Worth its own signal: a shrinking file set is the fingerprint
        // of a truncated response, and it is invisible in the diff of
        // any single file.
        yield { type: "unhealthy", errors: verdict.check.errors, lost: verdict.lost };
      }
    }

    // Say so when the result is still broken. Silence here is what let
    // a project stay broken across five consecutive "successful" builds.
    if (!residual.ok) {
      yield { type: "unhealthy", errors: residual.errors };
    }

    yield { type: "done", target: target.id, files };
  },
};

interface Verdict {
  files: ProjectFile[];
  check: CheckResult;
  /** Files the candidate dropped that the original had. */
  lost: string[];
}

/**
 * Choose between the first attempt and the correction.
 *
 * Rules, in order:
 *   1. An empty correction is not a correction.
 *   2. A correction that drops files the original had is a truncated
 *      response wearing a correction's clothes. Reject it outright —
 *      deleting a file nothing asked to delete is never the fix.
 *   3. Otherwise take whichever actually checks out; if both fail,
 *      take the one with fewer problems, preferring the original on a
 *      tie so a retry cannot churn a project sideways.
 */
export function betterOf(
  targetId: string,
  original: ProjectFile[],
  candidate: ProjectFile[]
): Verdict {
  const keep = (lost: string[] = []): Verdict => ({
    files: original,
    check: checkProject(targetId, original),
    lost,
  });

  if (candidate.length === 0) return keep();

  const had = new Set(original.map((f) => f.path));
  const has = new Set(candidate.map((f) => f.path));
  const lost = [...had].filter((p) => !has.has(p));
  if (lost.length) return keep(lost);

  const candidateCheck = checkProject(targetId, candidate);
  if (candidateCheck.ok) return { files: candidate, check: candidateCheck, lost: [] };

  const originalCheck = checkProject(targetId, original);
  if (originalCheck.ok) return { files: original, check: originalCheck, lost: [] };

  return countProblems(candidateCheck) < countProblems(originalCheck)
    ? { files: candidate, check: candidateCheck, lost: [] }
    : { files: original, check: originalCheck, lost: [] };
}

/** Rough severity: one per reported file section. */
function countProblems(c: CheckResult): number {
  return c.ok ? 0 : (c.errors.match(/^--- /gm)?.length ?? 1);
}
