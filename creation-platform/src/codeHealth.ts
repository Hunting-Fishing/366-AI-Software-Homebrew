// Size limits, measured and enforced.
//
// WHY THIS EXISTS
// A file that keeps growing is the thing that eventually breaks this
// platform, for a reason specific to how it works: every edit sends
// the file to the model and gets the file back. A 1,200-line component
// is 1,200 lines of input and 1,200 lines of output for a two-line
// change — slow, expensive, and far more likely to be truncated
// halfway. The failure looks like a bad model. It is a bad file.
//
// So the limits are not a style preference. They are the difference
// between an edit that lands and an edit that corrupts a project.
//
// THE NUMBERS
//   files      under 300 lines is comfortable, 500 is the ceiling
//   functions  under 25 lines, hard flag past 50
// These match the range the wider ecosystem settled on for exactly
// this reason (the "500 rule" for AI code editors, single-
// responsibility splitting in React codebases).
//
// Measured, reported, and put in the prompt — a rule nobody can see
// being broken is a rule that gets broken.

import type { ProjectFile } from "./lib/files.js";

export const FILE_COMFORTABLE = 300;
export const FILE_LIMIT = 500;
export const FN_COMFORTABLE = 25;
export const FN_LIMIT = 50;

export type HealthLevel = "good" | "watch" | "over";

export interface LongFunction {
  name: string;
  line: number;
  lines: number;
}

export interface FileHealth {
  path: string;
  lines: number;
  level: HealthLevel;
  /** Functions past the comfortable length, worst first. */
  longFunctions: LongFunction[];
  /** One sentence, addressed to a person, empty when there is nothing to say. */
  advice: string;
}

export interface ProjectHealth {
  files: FileHealth[];
  totalLines: number;
  /** Files at "over", worst first. The work queue. */
  worst: FileHealth[];
}

const CODE_EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".py", ".dart", ".gd"];

function isCode(path: string): boolean {
  return CODE_EXT.some((e) => path.endsWith(e));
}

/**
 * Function lengths, by brace depth.
 *
 * Deliberately not a parser. A real AST would be more accurate and
 * would also mean parsing every file on every keystroke, and failing
 * entirely on a file that is mid-edit and syntactically broken —
 * which is exactly when someone most wants to know how big it is.
 * Counting braces degrades gracefully instead.
 */
export function longFunctions(content: string): LongFunction[] {
  const lines = content.split("\n");
  const out: LongFunction[] = [];
  const open: Array<{ name: string; line: number; depth: number }> = [];
  let depth = 0;

  const DECL =
    /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()|([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|def\s+([A-Za-z_$][\w$]*))/;

  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, "");
    const m = DECL.exec(line);
    if (m) {
      const name = m[1] || m[2] || m[3] || m[4] || "anonymous";
      // Keywords that look like calls but are not declarations.
      if (!/^(if|for|while|switch|catch|return)$/.test(name)) {
        open.push({ name, line: i + 1, depth });
      }
    }
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        const top = open[open.length - 1];
        if (top && depth <= top.depth) {
          open.pop();
          const len = i + 1 - top.line + 1;
          if (len > FN_COMFORTABLE) out.push({ name: top.name, line: top.line, lines: len });
        }
      }
    }
  });

  return out.sort((a, b) => b.lines - a.lines);
}

export function fileHealth(f: ProjectFile): FileHealth {
  const lines = f.content.split("\n").length;
  const fns = isCode(f.path) ? longFunctions(f.content) : [];
  const level: HealthLevel =
    lines > FILE_LIMIT ? "over" : lines > FILE_COMFORTABLE ? "watch" : "good";

  let advice = "";
  if (level === "over") {
    advice =
      `${lines} lines — past the ${FILE_LIMIT}-line ceiling. Every edit to this file ` +
      `sends and returns the whole thing, so it is slow, costly, and the most likely ` +
      `place for a reply to be cut off. Split it by responsibility.`;
  } else if (level === "watch") {
    advice = `${lines} lines — still workable, but plan where it splits before it passes ${FILE_LIMIT}.`;
  }
  const bad = fns.filter((fn) => fn.lines > FN_LIMIT);
  if (bad.length) {
    const w = bad[0]!;
    advice += (advice ? " " : "") +
      `${w.name}() runs ${w.lines} lines from line ${w.line} — pull the distinct steps out as named helpers.`;
  }

  return { path: f.path, lines, level, longFunctions: fns, advice };
}

export function projectHealth(files: ProjectFile[]): ProjectHealth {
  const out = files.map(fileHealth);
  return {
    files: out,
    totalLines: out.reduce((n, f) => n + f.lines, 0),
    worst: out.filter((f) => f.level === "over").sort((a, b) => b.lines - a.lines),
  };
}

/** A prompt asking for one specific file to be broken up. */
export function refactorPrompt(h: FileHealth): string {
  const fns = h.longFunctions
    .slice(0, 4)
    .map((f) => `- ${f.name}() — ${f.lines} lines, from line ${f.line}`)
    .join("\n");
  return [
    `Split ${h.path} into smaller files. It is ${h.lines} lines, past the ${FILE_LIMIT}-line ceiling.`,
    "",
    fns ? "The longest functions in it:\n" + fns + "\n" : "",
    "How to split it:",
    "- One responsibility per file. A component, its sub-components, its data helpers and its constants are four things, not one.",
    "- Pull pure helpers (formatting, calculation, validation) into src/utils/.",
    "- Pull sub-components that are only used here into their own files beside it.",
    "- Move long constant lists and seed data into their own module.",
    "- Keep every new file under 300 lines and every function under 25.",
    "",
    "Behaviour must not change. Update every import that referred to what you moved, and create every file you reference.",
  ].filter(Boolean).join("\n");
}

/**
 * The rules, as prompt text.
 *
 * Stated with the reason attached: "keep files small" is advice a
 * model will trade away under pressure, but "a big file is the one
 * most likely to be truncated mid-edit" is a constraint it can act on.
 */
export const SIZE_RULES = `
FILE SIZE — this is a hard constraint, not a preference
- Keep every source file under ${FILE_COMFORTABLE} lines where you can, and never past ${FILE_LIMIT}.
- Keep functions and components under ${FN_COMFORTABLE} lines. Past ${FN_LIMIT} lines, split it.
- The reason is mechanical: editing a file means sending it and receiving it in full. A ${FILE_LIMIT}+ line file makes every future change slow, expensive, and far more likely to be cut off mid-reply — which corrupts the project rather than merely failing.
- So when a file is heading past ${FILE_LIMIT} lines, split it as part of the work you are already doing rather than leaving it:
  - One responsibility per file. A page, its sub-components, its helpers and its constants are four files, not one.
  - Pure helpers (formatting, calculation, validation) go in src/utils/.
  - Sub-components used by one screen live beside it in their own files.
  - Long constant lists and seed data get their own module.
- Never split a file so aggressively that the pieces are meaningless. Under 50 lines per file is usually a sign of splitting for its own sake.
`.trim();
