import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonProjectStore } from "../src/services/projects.js";

// Reported as: "duplicate key value violates unique constraint
// project_versions_unique_version".
//
// Two causes, both introduced by auto-save:
//   1. appendVersion reads max(version) then inserts — two saves in
//      flight read the same number and one loses. Fixed in the Supabase
//      store by retrying on the constraint violation.
//   2. Far too many saves. A build saved, the planner saved moments
//      later, a ticked checkbox saved again — each appending a version.
//      A version should mean "a build happened".

function store() {
  return new JsonProjectStore(fs.mkdtempSync(path.join(os.tmpdir(), "cp-silent-")));
}

const FILES = [{ path: "src/App.jsx", content: "v1\n" }];

test("a normal update appends a version", async () => {
  const s = store();
  const p = await s.save("App", "first", "", "react", FILES);
  await s.update(p.id, { prompt: "second", files: [{ path: "src/App.jsx", content: "v2\n" }] });
  assert.equal((await s.listVersions(p.id)).length, 2);
});

test("a silent update does not", async () => {
  const s = store();
  const p = await s.save("App", "first", "", "react", FILES);
  await s.update(p.id, { brain: { phases: [] }, silent: true });
  assert.equal((await s.listVersions(p.id)).length, 1,
    "ticking a task is not a build and must not create a restore point");
});

test("a silent update still persists the change", async () => {
  const s = store();
  const p = await s.save("App", "first", "", "react", FILES);
  await s.update(p.id, { brain: { goal: "ship it", phases: [] }, silent: true });
  const after = await s.get(p.id);
  assert.deepEqual(after?.brain, { goal: "ship it", phases: [] },
    "silent means no version, not no save");
});

test("many silent saves leave the history clean", async () => {
  // The realistic pattern: one build, then the planner and a few
  // checkbox ticks. Only the build should be recoverable.
  const s = store();
  const p = await s.save("App", "build a thing", "", "react", FILES);
  for (let i = 0; i < 8; i++) {
    await s.update(p.id, { brain: { tick: i, phases: [] }, silent: true });
  }
  const versions = await s.listVersions(p.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0]?.label, "build a thing");
});

test("the brain rides along in the version snapshot", async () => {
  // Rolling back a build must roll back its plan too — a restored app
  // whose roadmap describes different work is worse than no roadmap.
  const s = store();
  const p = await s.save("App", "first", "", "react", FILES);
  await s.update(p.id, { brain: { goal: "v2 plan", phases: [] } });
  const v1 = await s.getVersion(p.id, 1);
  const v2 = await s.getVersion(p.id, 2);
  assert.deepEqual(v1?.brain, {});
  assert.deepEqual(v2?.brain, { goal: "v2 plan", phases: [] });
});
