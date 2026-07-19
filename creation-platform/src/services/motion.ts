// ============================================================
// IN-HOUSE MOTION ENGINE — our own video generation.
// ============================================================
// Turns still images (AI keyframes or the user's own photos)
// into a finished movie using FFmpeg only: cinematic pans and
// zooms (the "Ken Burns" technique used in documentaries),
// alternating direction per scene, stitched into one film.
//
// 100% our software. No external video API. No per-scene cost.
// The Veo adapter remains available as the premium AI-motion
// option, but this engine means movies always work, free.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MEDIA_DIR, runFfmpeg, ffmpegAvailable, assemble } from "./studio.js";

export interface MotionImage {
  id: string | number;
  b64: string; // PNG/JPEG base64
}

const SCENE_SECONDS = 5;
const FPS = 25;

// A rotation of camera moves so the film doesn't feel repetitive.
function moveFilter(index: number, w: number, h: number): string {
  const frames = SCENE_SECONDS * FPS;
  const zoomIn = `zoompan=z='min(zoom+0.0016,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
  const zoomOut = `zoompan=z='if(lte(on,1),1.25,max(zoom-0.0016,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
  const panRight = `zoompan=z='1.18':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
  const panLeft = `zoompan=z='1.18':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
  const moves = [zoomIn, panRight, zoomOut, panLeft];
  return moves[index % moves.length]!;
}

/** Render a whole movie from stills; returns the /media path of the film. */
export async function kenBurnsMovie(
  images: MotionImage[],
  aspect: "16:9" | "9:16" = "16:9"
): Promise<string> {
  if (!ffmpegAvailable()) {
    throw new Error(
      "FFmpeg is not installed. Windows: open a terminal and run  winget install ffmpeg , then restart the server."
    );
  }
  if (images.length === 0) throw new Error("No images to animate.");

  const [w, h] = aspect === "9:16" ? [720, 1280] : [1280, 720];
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-motion-"));
  const clips: string[] = [];

  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i]!;
      const still = path.join(workDir, `still-${i}.png`);
      fs.writeFileSync(still, Buffer.from(img.b64, "base64"));

      const clipName = `inhouse-${String(img.id).replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}-${i}.mp4`;
      // Upscale first so zoompan has pixels to move through, then animate.
      const vf = `scale=${w * 4}:${h * 4}:force_original_aspect_ratio=increase,crop=${w * 4}:${h * 4},${moveFilter(i, w, h)}`;
      await runFfmpeg([
        "-y",
        "-loop", "1",
        "-i", still,
        "-vf", vf,
        "-t", String(SCENE_SECONDS),
        "-r", String(FPS),
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-preset", "veryfast",
        path.join(MEDIA_DIR, clipName),
      ]);
      clips.push("/media/" + clipName);
    }
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }

  return assemble(clips);
}
