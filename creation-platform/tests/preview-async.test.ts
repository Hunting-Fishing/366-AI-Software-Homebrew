import { test } from "node:test";
import assert from "node:assert/strict";
import { previewRunner } from "../src/services/runner.js";
import type { ProjectFile } from "../src/lib/files.js";

// The bug: POST /api/preview held the HTTP request open for the whole
// 60-120s a React preview takes to install and boot. Render's edge gives
// up around 100s and returns its own HTML error page, so the browser's
// res.json() threw "Unexpected token '<'" — an error pointing nowhere
// near the cause. It never showed up locally because there is no proxy.
//
// begin() must therefore return immediately, always.

// Neither fixture can actually boot: no app.py, no package.json. Both
// reject almost immediately, so the suite stays fast. What is under test
// is what begin() returns SYNCHRONOUSLY — a real boot would tell us
// nothing extra and would add 15s of waiting for a port.
const FLASK: ProjectFile[] = [{ path: "readme.txt", content: "not a flask app\n" }];

// No package.json, so startReact rejects immediately instead of
// spawning a real npm install. begin() still reports the install phase
// synchronously, which is what these tests check.
const VITE: ProjectFile[] = [{ path: "src/App.jsx", content: "export default () => null;\n" }];

test("idle before anything starts", () => {
  previewRunner.stop();
  const s = previewRunner.status();
  assert.equal(s.state, "idle");
  assert.equal(s.url, undefined, "no url until it is actually ready");
});

test("begin() returns immediately — it must not await the boot", () => {
  previewRunner.stop();
  const t0 = Date.now();
  const s = previewRunner.begin(FLASK, false);
  const elapsed = Date.now() - t0;

  assert.ok(elapsed < 250, `begin() took ${elapsed}ms; it must not block on the preview starting`);
  assert.ok(["starting", "error"].includes(s.state), `unexpected first state: ${s.state}`);
  previewRunner.stop();
});

test("a Vite project reports the install phase first", () => {
  previewRunner.stop();
  const s = previewRunner.begin(
    VITE,
    true
  );
  assert.equal(s.state, "installing");
  assert.match(s.message ?? "", /packages/i, "the phase text is what the user reads while waiting");
  previewRunner.stop();
});

test("elapsed time is reported while working, so the UI can count up", () => {
  previewRunner.stop();
  previewRunner.begin(VITE, true);
  const s = previewRunner.status();
  assert.equal(typeof s.elapsedMs, "number");
  previewRunner.stop();
});

test("a ready state is the ONLY one that carries a url", () => {
  previewRunner.stop();
  for (const s of [previewRunner.status(), previewRunner.begin(FLASK, false)]) {
    if (s.state !== "ready") {
      assert.equal(s.url, undefined, `state ${s.state} must not hand the browser a url`);
    }
  }
  previewRunner.stop();
});

test("stop() returns to idle and drops the port", () => {
  previewRunner.begin(FLASK, false);
  previewRunner.stop();
  assert.equal(previewRunner.status().state, "idle");
  assert.equal(previewRunner.port(), null);
});

test("starting a second preview supersedes the first", () => {
  previewRunner.stop();
  previewRunner.begin(VITE, true);
  const second = previewRunner.begin(FLASK, false);
  // The Vite run is abandoned; the state reflects the Flask run only.
  assert.equal(second.state, "starting");
  assert.doesNotMatch(second.message ?? "", /packages/i,
    "a superseded run must not keep writing its phase over the new one");
  previewRunner.stop();
});
