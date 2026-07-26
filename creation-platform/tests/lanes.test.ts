import { test } from "node:test";
import assert from "node:assert/strict";
import { allLanes, modeOf, selectLane } from "../src/lanes/index.js";
import { buildMessages } from "../src/lanes/inhouse.js";

// The lane seam exists so Lane B (OpenHands) can be added without
// touching the frontend or the route. These tests lock the contract.

test("a lane is always selectable — no unhandled target", () => {
  for (const target of ["web", "react", "flutter", "python", "godot", "book", "video"]) {
    for (const mode of ["create", "edit"] as const) {
      const lane = selectLane(target, mode);
      assert.ok(lane, `no lane for ${target}/${mode}`);
      assert.equal(typeof lane.run, "function");
    }
  }
});

test("an unknown target still resolves — inhouse is the fallback", () => {
  const lane = selectLane("some-future-target", "create");
  assert.equal(lane.id, "inhouse");
});

test("the fallback lane is registered last", () => {
  const ids = allLanes().map((l) => l.id);
  assert.equal(ids.at(-1), "inhouse", "inhouse must stay last or it shadows other lanes");
});

// ── mode detection ───────────────────────────────────────────
// This is what routes an edit to Lane B once Lane B exists, so it
// needs to be right before Lane B is written.

test("no files and no code means create", () => {
  assert.equal(modeOf({ files: [] }), "create");
  assert.equal(modeOf({ files: [], code: "" }), "create");
  assert.equal(modeOf({ files: [], code: "   " }), "create", "whitespace is not a project");
});

test("existing files mean edit", () => {
  assert.equal(modeOf({ files: [{ path: "app.jsx", content: "x" }] }), "edit");
});

test("existing single-file code means edit", () => {
  assert.equal(modeOf({ files: [], code: "<!DOCTYPE html><html></html>" }), "edit");
});

// ── prompt construction ──────────────────────────────────────

test("a new project gets a plain build instruction", () => {
  const msgs = buildMessages("a todo app");
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0]?.role, "user");
  assert.match(msgs[0]?.content ?? "", /^Build this: a todo app/);
});

test("an edit replays the existing project as context", () => {
  const msgs = buildMessages("make it blue", undefined, [
    { path: "src/App.jsx", content: "export default function App(){}\n" },
  ]);
  assert.equal(msgs.length, 3);
  assert.match(msgs[2]?.content ?? "", /^make it blue/);
  // The edit contract rides along, because a model told nothing about
  // merging re-emits the whole project out of caution.
  assert.match(msgs[2]?.content ?? "", /ONLY the files you actually changed/i);
  assert.match(msgs[0]?.content ?? "", /===FILE: src\/App\.jsx===/);
});

test("multi-file context wins over single-file code when both are present", () => {
  const msgs = buildMessages("change it", "<html>old</html>", [
    { path: "a.js", content: "1\n" },
  ]);
  assert.match(msgs[0]?.content ?? "", /===FILE: a\.js===/);
  assert.doesNotMatch(msgs[0]?.content ?? "", /<html>old<\/html>/);
});
