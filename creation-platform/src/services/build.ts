// Build service: turn a generated React (Vite) project into
// optimized static files ready for the 🚀 Publish pipeline.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectFile } from "../lib/files.js";

// Built Vite output is text (hashed .js/.css + index.html).
const TEXT_EXT = new Set([".html", ".js", ".css", ".svg", ".json", ".txt", ".map", ".webmanifest"]);

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd });
    let err = "";
    p.stderr?.on("data", (d: Buffer) => (err += d.toString()));
    p.stdout?.on("data", (d: Buffer) => (err += d.toString()));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} failed:\n` + err.slice(-800)))
    );
    p.on("error", () => reject(new Error(`${cmd} not found — install Node.js from nodejs.org.`)));
  });
}

function walk(dir: string, base: string, out: ProjectFile[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push({
        path: path.relative(base, full).split(path.sep).join("/"),
        content: fs.readFileSync(full, "utf8"),
      });
    }
  }
}

/** npm install + npm run build; returns the dist/ files. */
export async function buildReact(files: ProjectFile[]): Promise<ProjectFile[]> {
  if (!files.some((f) => f.path === "package.json")) {
    throw new Error("This project has no package.json to build.");
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-build-"));
  try {
    for (const f of files) {
      const p = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.content);
    }
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    await run(npm, ["install", "--no-audit", "--no-fund"], dir);
    await run(npm, ["run", "build"], dir);

    const dist = path.join(dir, "dist");
    if (!fs.existsSync(dist)) throw new Error("Build finished but no dist/ folder was produced.");
    const out: ProjectFile[] = [];
    walk(dist, dist, out);
    if (out.length === 0) throw new Error("Build produced no deployable files.");
    return out;
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
