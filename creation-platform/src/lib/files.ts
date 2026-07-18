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
