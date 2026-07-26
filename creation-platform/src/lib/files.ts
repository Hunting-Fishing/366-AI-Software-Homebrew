// Parse multi-file model output (===FILE: path=== ... ===ENDFILE===)
// into a list of project files. Used by Flutter/Python targets.

export interface ProjectFile {
  path: string;
  content: string;
}

const FILE_MARKER = /===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)===ENDFILE===/g;

export function parseFiles(text: string, fallbackFile: string): ProjectFile[] {
  // Strip a single outer markdown fence if the model added one anyway.
  const fenced = text.match(/^```[a-z]*\s*\n([\s\S]*?)\n```\s*$/);
  const source = fenced?.[1] ?? text;

  const files: ProjectFile[] = [];
  for (const match of source.matchAll(FILE_MARKER)) {
    const path = (match[1] ?? "").trim();
    const content = (match[2] ?? "").replace(/\s+$/, "") + "\n";
    // Reject path tricks like "../" — keep everything inside the project.
    if (path && !path.includes("..") && !path.startsWith("/")) {
      files.push({ path, content });
    }
  }

  // Fallback: model ignored the format → treat everything as one file.
  if (files.length === 0 && source.trim()) {
    files.push({ path: fallbackFile, content: source.trim() + "\n" });
  }
  return files;
}

// Serialize files back into marker format (used as conversation
// context when the user asks for changes to an existing project).
export function serializeFiles(files: ProjectFile[]): string {
  return files
    .map((f) => `===FILE: ${f.path}===\n${f.content}===ENDFILE===`)
    .join("\n");
}

/** Files the model explicitly asked to remove: ===DELETE: path=== */
const DELETE_MARKER = /^===DELETE:\s*(.+?)\s*===\s*$/gm;

export function parseDeletions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DELETE_MARKER)) {
    const p = (m[1] ?? "").trim();
    if (p && !p.includes("..") && !p.startsWith("/")) out.push(p);
  }
  return out;
}

export interface EditResult {
  files: ProjectFile[];
  added: string[];
  modified: string[];
  removed: string[];
}

/**
 * Apply a partial reply to an existing project.
 *
 * WHY THIS EXISTS
 * Edits used to work by replacement: the whole project went to the
 * model, the whole project came back, and whatever came back became
 * the project. Three things followed, and Jordi hit all three.
 *
 *   1. Cost and latency scaled with project size. A one-line fix on a
 *      29-file app rewrote 29 files.
 *   2. Any file the model omitted was DELETED. That is how RestoBar
 *      Manager lost src/App.jsx.
 *   3. The guard added to stop (2) — reject a reply that drops files —
 *      then made a genuine fix impossible on a large project, because
 *      no reply short of all 29 files was ever accepted. The Fix
 *      button could not work by construction.
 *
 * Merging removes the whole class. A file present in the reply is
 * written; a file absent is left exactly as it was; removal has to be
 * asked for explicitly. Omission is no longer destructive, so a
 * partial reply is the normal case rather than a hazard.
 */
export function applyEdit(
  current: ProjectFile[],
  reply: ProjectFile[],
  deletions: string[] = []
): EditResult {
  const byPath = new Map(current.map((f) => [f.path, f.content]));
  const added: string[] = [];
  const modified: string[] = [];

  for (const f of reply) {
    const before = byPath.get(f.path);
    if (before === undefined) added.push(f.path);
    else if (before !== f.content) modified.push(f.path);
    // Identical content is neither: the model re-sent a file it did
    // not change, and saying "modified" would be a lie in the diff.
    byPath.set(f.path, f.content);
  }

  const removed: string[] = [];
  for (const p of deletions) {
    if (byPath.delete(p)) removed.push(p);
  }

  return {
    files: [...byPath].map(([path, content]) => ({ path, content })),
    added,
    modified,
    removed,
  };
}
