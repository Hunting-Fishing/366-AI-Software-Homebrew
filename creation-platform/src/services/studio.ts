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

export function runFfmpeg(args: string[]): Promise<void> {
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

function hasAudioStream(filePath: string): boolean {
  try {
    const r = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", filePath],
      { encoding: "utf8", timeout: 10000 }
    );
    return r.status === 0 && r.stdout.includes("audio");
  } catch {
    return false;
  }
}

/** Mix a background music file (mp3/wav/etc.) into a movie.
    If the movie already has narration, music ducks underneath it. */
export async function mixMusic(movieFile: string, music: Buffer, ext: string): Promise<string> {
  if (!ffmpegAvailable()) throw new Error("FFmpeg is not installed (winget install ffmpeg).");
  const movieName = path.basename(movieFile);
  const moviePath = path.join(MEDIA_DIR, movieName);
  if (!fs.existsSync(moviePath)) throw new Error(`Movie not found: ${movieName}`);

  const safeExt = (ext || "mp3").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp3";
  const musicPath = path.join(MEDIA_DIR, "music-" + Date.now() + "." + safeExt);
  fs.writeFileSync(musicPath, music);
  const outName = "scored-" + Date.now() + ".mp4";
  const outPath = path.join(MEDIA_DIR, outName);

  try {
    if (hasAudioStream(moviePath)) {
      // Keep narration on top; music quietly underneath.
      await runFfmpeg([
        "-y", "-i", moviePath, "-stream_loop", "-1", "-i", musicPath,
        "-filter_complex", "[1:a]volume=0.25[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]",
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-shortest", outPath,
      ]);
    } else {
      await runFfmpeg([
        "-y", "-i", moviePath, "-stream_loop", "-1", "-i", musicPath,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-shortest", outPath,
      ]);
    }
  } finally {
    try { fs.rmSync(musicPath); } catch { /* best effort */ }
  }
  return "/media/" + outName;
}

/** Mix a narration track (raw PCM s16le 24kHz mono) into a movie. */
export async function mixVoiceover(movieFile: string, pcm: Buffer): Promise<string> {
  if (!ffmpegAvailable()) {
    throw new Error("FFmpeg is not installed (winget install ffmpeg).");
  }
  const movieName = path.basename(movieFile);
  const moviePath = path.join(MEDIA_DIR, movieName);
  if (!fs.existsSync(moviePath)) throw new Error(`Movie not found: ${movieName}`);

  const pcmPath = path.join(MEDIA_DIR, "narration-" + Date.now() + ".pcm");
  fs.writeFileSync(pcmPath, pcm);
  const outName = "voiced-" + Date.now() + ".mp4";
  try {
    await runFfmpeg([
      "-y",
      "-i", moviePath,
      "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcmPath,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac",
      "-shortest",
      path.join(MEDIA_DIR, outName),
    ]);
  } finally {
    try { fs.rmSync(pcmPath); } catch { /* best effort */ }
  }
  return "/media/" + outName;
}
