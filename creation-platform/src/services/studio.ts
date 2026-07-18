// Movie studio service: stores generated clips in media/ and
// stitches them into a final film with FFmpeg (free, in-house).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = path.join(__dirname, "..", "..", "media");
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

export function ffmpegAvailable(): boolean {
  try {
    return spawnSync("ffmpeg", ["-version"], { timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

/** Save a clip; returns its public path under /media. */
export function saveClip(name: string, data: Buffer): string {
  const safe = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  fs.writeFileSync(path.join(MEDIA_DIR, safe), data);
  return "/media/" + safe;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("FFmpeg failed:\n" + stderr.slice(-800)));
    });
    proc.on("error", () => reject(new Error("FFmpeg is not installed. Get it from https://ffmpeg.org/download.html (on Windows: winget install ffmpeg).")));
  });
}

/** Concatenate clips (public /media paths or bare names) into one film. */
export async function assemble(files: string[]): Promise<string> {
  if (!ffmpegAvailable()) {
    throw new Error("FFmpeg is not installed on this machine. Install it (Windows: open a terminal and run  winget install ffmpeg ), restart the server, and try again.");
  }
  if (files.length === 0) throw new Error("No clips to assemble.");

  const names = files.map((f) => path.basename(f));
  for (const n of names) {
    if (!fs.existsSync(path.join(MEDIA_DIR, n))) {
      throw new Error(`Clip not found: ${n}`);
    }
  }

  const listFile = path.join(MEDIA_DIR, "concat-" + Date.now() + ".txt");
  fs.writeFileSync(
    listFile,
    names.map((n) => `file '${path.join(MEDIA_DIR, n).replace(/'/g, "'\\''")}'`).join("\n")
  );
  const outName = "final-" + Date.now() + ".mp4";
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", path.join(MEDIA_DIR, outName)]);
  } finally {
    try { fs.rmSync(listFile); } catch { /* best effort */ }
  }
  return "/media/" + outName;
}
