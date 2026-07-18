import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ffmpegAvailable, saveClip, assemble, MEDIA_DIR } from "../src/services/studio.js";

test("ffmpegAvailable returns a boolean", () => {
  assert.equal(typeof ffmpegAvailable(), "boolean");
});

test("saveClip sanitizes dangerous names", () => {
  const file = saveClip("../../evil name.mp4", Buffer.from("x"));
  assert.match(file, /^\/media\/[a-zA-Z0-9._-]+$/);
  const onDisk = path.join(MEDIA_DIR, path.basename(file));
  assert.ok(fs.existsSync(onDisk));
  fs.rmSync(onDisk);
});

test("assemble rejects empty input", async (t) => {
  if (!ffmpegAvailable()) {
    t.skip("ffmpeg not installed");
    return;
  }
  await assert.rejects(() => assemble([]), /No clips/);
});

test("assemble rejects missing clips", async (t) => {
  if (!ffmpegAvailable()) {
    t.skip("ffmpeg not installed");
    return;
  }
  await assert.rejects(() => assemble(["/media/does-not-exist.mp4"]), /not found/);
});
