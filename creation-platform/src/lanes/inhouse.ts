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
// EDITS ARE MERGED, NOT REPLACED.
// An edit used to send the whole project and take the whole project
// back, so a one-line fix rewrote every file, and anything the model
// omitted was deleted. The reply is now merged onto what exists:
// files present are written, files absent are kept, and removal must
// be asked for with ===DELETE:. See applyEdit in lib/files.ts.

import { streamGenerate, type ChatMessage } from "../providers/index.js";
import { getTarget } from "../targets.js";
import { extractHtml } from "../lib/extract.js";
import { parseFiles, parseDeletions, applyEdit, serializeFiles, type ProjectFile } from "../lib/files.js";
import { checkProject, type CheckResult } from "../lib/check.js";
import { extractContracts, contractDiff, contractBrief } from "../services/contracts.js";
import type { AgentEvent, AgentLane, LaneRequest } from "./types.js";

/**
 * The rule that makes an edit an edit.
 *
 * Without this the model re-emits the entire project for a one-line
 * change: slow, expensive, and — before applyEdit — destructive, since
 * anything it left out was deleted.
 */
export const EDIT_CONTRACT = [
  "IMPORTANT — how to reply to an edit:",
  "- Output ONLY the files you actually changed, plus any new files. Use the same ===FILE: path=== / ===ENDFILE=== format.",
  "- Files you do not include are LEFT EXACTLY AS THEY ARE. You do not need to re-send them, and re-sending an unchanged file wastes time and money for no benefit.",
  "- When a file does need changing, output that whole file, complete. There is no patch format here.",
  "- To remove a file, write a line: ===DELETE: path/of/file.ext===  Do this only when the change genuinely requires it.",
  "- Before you finish: if you referenced a file that does not exist yet, create it in this same reply. A missing import is the most common way an edit breaks a working app.",
  "- If a file you are editing is already past 500 lines, split it as part of this change rather than making it longer. A file that big makes every future edit slow and far more likely to be cut off mid-reply.",
  "- Start with one short sentence saying what you changed and why. No other prose.",
].join("\n");

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
      { role: "user", content: prompt + "\n\n" + EDIT_CONTRACT },
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

    // On an edit, the reply is a patch: merge it onto what exists. On
    // a first build there is nothing to merge onto, so it stands alone.
    const base = req.files ?? [];
    const isEdit = base.length > 0;

    const merge = (text: string, onto: ProjectFile[]) => {
      const parsed = parseFiles(text, target.fallbackFile);
      return isEdit
        ? applyEdit(onto, parsed, parseDeletions(text))
        : { files: parsed, added: parsed.map((f) => f.path), modified: [], removed: [] };
    };

    let edit = merge(full, base);
    let files = edit.files;

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
            "That has errors. Fix them.\n\n" +
            "Output ONLY the files you need to change or create, in the same " +
            "===FILE: format. Everything you leave out is kept as it is, so send " +
            "the smallest set of files that actually fixes this.\n\n" +
            "If a file is imported but missing, CREATE it — do not remove the " +
            "import unless the feature is genuinely unwanted.\n\nErrors:\n\n" +
            check.errors,
        },
      ];
      const fixed = yield* runStream(fixMessages);
      // The correction is a patch onto the attempt we just made, not a
      // replacement for it. This is what makes Fix work on a large
      // project: the model sends the two files that matter, and the
      // other twenty-seven survive because nothing touched them.
      const attempt = applyEdit(files, parseFiles(fixed, target.fallbackFile), parseDeletions(fixed));

      const verdict = betterOf(target.id, files, attempt.files);
      if (verdict.files === attempt.files) {
        edit = {
          files: attempt.files,
          added: [...new Set([...edit.added, ...attempt.added])],
          modified: [...new Set([...edit.modified, ...attempt.modified])],
          removed: [...new Set([...edit.removed, ...attempt.removed])],
        };
      }
      files = verdict.files;
      residual = verdict.check;
      if (verdict.lost.length) {
        // Worth its own signal: a shrinking file set is the fingerprint
        // of a truncated response, and it is invisible in the diff of
        // any single file.
        yield { type: "unhealthy", errors: verdict.check.errors, lost: verdict.lost };
      }
    }

    // ── Contract check ───────────────────────────────────────
    // A refactor MOVES things, and every move is a chance to drop
    // something outside the edited file that depended on a name. The
    // app still compiles and a collection is quietly spelled
    // differently — which looks like data loss to whoever uses it.
    if (isEdit) {
      const losses = contractDiff(extractContracts(base), extractContracts(files));
      if (losses.length) yield { type: "contracts", losses };
    }

    // Say so when the result is still broken. Silence here is what let
    // a project stay broken across five consecutive "successful" builds.
    if (!residual.ok) {
      yield { type: "unhealthy", errors: residual.errors };
    }

    yield {
      type: "done",
      target: target.id,
      files,
      // What actually changed, so the UI can colour it rather than
      // making the user diff twenty-nine files by eye.
      added: edit.added,
      modified: edit.modified,
      removed: edit.removed,
    };
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
