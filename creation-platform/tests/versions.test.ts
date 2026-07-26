import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonProjectStore, applyPatch, versionLabel } from "../src/services/projects.js";
import type { Project } from "../src/services/projects.js";

function store() {
  return new JsonProjectStore(fs.mkdtempSync(path.join(os.tmpdir(), "cp-ver-")));
}

const FILES = [{ path: "src/App.jsx", content: "v1\n" }];

// ── the core promise ─────────────────────────────────────────

test("saving a project creates version 1", async () => {
  const s = store();
  const p = await s.save("My App", "build a counter", "", "react", FILES);
  const versions = await s.listVersions(p.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0]?.version, 1);
  assert.equal(versions[0]?.label, "build a counter");
});

test("each update appends a version, newest first", async () => {
  const s = store();
  const p = await s.save("My App", "first", "", "react", FILES);
  await s.update(p.id, { prompt: "make it blue", files: [{ path: "src/App.jsx", content: "v2\n" }] });
  await s.update(p.id, { prompt: "add a header", files: [{ path: "src/App.jsx", content: "v3\n" }] });

  const versions = await s.listVersions(p.id);
  assert.deepEqual(versions.map((v) => v.version), [3, 2, 1]);
  assert.deepEqual(versions.map((v) => v.label), ["add a header", "make it blue", "first"]);
});

test("an old version still holds the old content", async () => {
  const s = store();
  const p = await s.save("My App", "first", "", "react", FILES);
  await s.update(p.id, { files: [{ path: "src/App.jsx", content: "v2\n" }] });

  const v1 = await s.getVersion(p.id, 1);
  assert.equal(v1?.files[0]?.content, "v1\n");
  const current = await s.get(p.id);
  assert.equal(current?.files[0]?.content, "v2\n");
});

test("restoring brings back the old content", async () => {
  const s = store();
  const p = await s.save("My App", "first", "", "react", FILES);
  await s.update(p.id, { files: [{ path: "src/App.jsx", content: "broken\n" }] });

  await s.restoreVersion(p.id, 1);
  const current = await s.get(p.id);
  assert.equal(current?.files[0]?.content, "v1\n");
});

test("restoring is append-only, so an undo can be undone", async () => {
  const s = store();
  const p = await s.save("My App", "first", "", "react", FILES);
  await s.update(p.id, { files: [{ path: "src/App.jsx", content: "v2\n" }] });

  await s.restoreVersion(p.id, 1);
  const versions = await s.listVersions(p.id);
  assert.equal(versions.length, 3, "the restore is itself a version, nothing was deleted");
  assert.equal(versions[0]?.version, 3);
  assert.match(versions[0]?.label ?? "", /Restored version 1/);

  // v2 is still reachable — undo the undo.
  await s.restoreVersion(p.id, 2);
  assert.equal((await s.get(p.id))?.files[0]?.content, "v2\n");
});

// ── edge cases ───────────────────────────────────────────────

test("updating a project that does not exist returns null, not a crash", async () => {
  const s = store();
  assert.equal(await s.update("nope", { prompt: "x" }), null);
});

test("asking for a version that does not exist returns null", async () => {
  const s = store();
  const p = await s.save("My App", "first", "", "react", FILES);
  assert.equal(await s.getVersion(p.id, 99), null);
  assert.equal(await s.restoreVersion(p.id, 99), null);
});

test("a project with no history lists no versions rather than throwing", async () => {
  const s = store();
  assert.deepEqual(await s.listVersions("never-saved"), []);
});

test("history files do not show up as projects", async () => {
  const s = store();
  await s.save("My App", "first", "", "react", FILES);
  const list = await s.list();
  assert.equal(list.length, 1, "the .versions.json sidecar must not be listed as a project");
});

test("a corrupt history file does not make the project unreadable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-ver-"));
  const s = new JsonProjectStore(dir);
  const p = await s.save("My App", "first", "", "react", FILES);
  fs.writeFileSync(path.join(dir, p.id + ".versions.json"), "{ not json");

  assert.deepEqual(await s.listVersions(p.id), []);
  assert.equal((await s.get(p.id))?.files[0]?.content, "v1\n", "the project itself still loads");
});

// ── patch semantics ──────────────────────────────────────────

test("omitted patch fields are kept, not blanked", () => {
  const current: Project = {
    id: "x", name: "My App", prompt: "first", target: "react",
    code: "", files: FILES, binaries: [{ path: "a.png", b64: "AA" }], brain: {},
    savedAt: "2026-01-01T00:00:00.000Z",
  };
  const next = applyPatch(current, { prompt: "second" });
  assert.equal(next.prompt, "second");
  assert.equal(next.name, "My App");
  assert.deepEqual(next.files, FILES);
  assert.deepEqual(next.binaries, current.binaries);
  assert.notEqual(next.savedAt, current.savedAt, "savedAt always moves forward");
});

test("labels fall back sensibly and stay short", () => {
  assert.equal(versionLabel({ label: "Restored version 2" }, "ignored"), "Restored version 2");
  assert.equal(versionLabel({ prompt: "make it blue" }, "old"), "make it blue");
  assert.equal(versionLabel({}, "the original prompt"), "the original prompt");
  assert.equal(versionLabel({}, ""), "Saved");
  const long = versionLabel({ prompt: "x".repeat(200) }, "");
  assert.equal(long.length, 78, "long prompts are truncated for the history list");
  assert.match(long, /…$/);
});
