import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyEdit, parseDeletions, parseFiles } from "../src/lib/files.js";
import { EDIT_CONTRACT, betterOf } from "../src/lanes/inhouse.js";
import type { ProjectFile } from "../src/lib/files.js";

// WHY EDITS ARE MERGED NOW
//
// An edit used to send the whole project and take the whole project
// back. Three consequences, and Jordi hit all three in order:
//
//   1. A one-line fix rewrote all 29 files — slow and expensive.
//   2. Any file the model omitted was DELETED. That is how RestoBar
//      Manager lost src/App.jsx.
//   3. The guard added to stop (2) — reject a reply that drops files —
//      then made a genuine fix IMPOSSIBLE on a large project, because
//      no reply short of all 29 files was ever accepted. The Fix
//      button could not work by construction.
//
// Merging removes the class. Present = written, absent = untouched,
// removal must be asked for.

const APP: ProjectFile[] = [
  { path: "index.html", content: '<html><body><div id="root"></div></body></html>' },
  { path: "package.json", content: '{"dependencies":{"react":"18.3.1","react-dom":"18.3.1"}}' },
  { path: "src/main.jsx", content: "import App from './App.jsx';\nconsole.log(App);\n" },
  { path: "src/Nav.jsx", content: "export default () => null;\n" },
];

test("a file absent from the reply is left exactly as it was", () => {
  // The whole point. This is the assertion that makes omission safe.
  const out = applyEdit(APP, [{ path: "src/Nav.jsx", content: "export default () => 'nav';\n" }]);
  assert.equal(out.files.length, 4);
  assert.equal(out.files.find((f) => f.path === "src/main.jsx")!.content, APP[2]!.content);
});

test("a new file is added without disturbing anything", () => {
  const out = applyEdit(APP, [{ path: "src/App.jsx", content: "export default () => <div/>;\n" }]);
  assert.equal(out.files.length, 5);
  assert.deepEqual(out.added, ["src/App.jsx"]);
  assert.deepEqual(out.modified, []);
});

test("a changed file is reported as modified", () => {
  const out = applyEdit(APP, [{ path: "src/Nav.jsx", content: "export default () => 'x';\n" }]);
  assert.deepEqual(out.modified, ["src/Nav.jsx"]);
  assert.deepEqual(out.added, []);
});

test("a re-sent but identical file is neither added nor modified", () => {
  // Otherwise every diff claims changes that are not there, and the
  // colour coding stops meaning anything.
  const out = applyEdit(APP, [{ path: "src/Nav.jsx", content: APP[3]!.content }]);
  assert.deepEqual(out.modified, []);
  assert.deepEqual(out.added, []);
});

test("removal has to be asked for explicitly", () => {
  const out = applyEdit(APP, [], ["src/Nav.jsx"]);
  assert.deepEqual(out.removed, ["src/Nav.jsx"]);
  assert.equal(out.files.length, 3);
});

test("deleting something that is not there is not a removal", () => {
  const out = applyEdit(APP, [], ["src/Ghost.jsx"]);
  assert.deepEqual(out.removed, []);
  assert.equal(out.files.length, 4);
});

test("an empty reply changes nothing at all", () => {
  // Previously this was the difference between a project and no
  // project.
  const out = applyEdit(APP, []);
  assert.deepEqual(out.files, APP);
  assert.deepEqual([out.added, out.modified, out.removed], [[], [], []]);
});

test("the delete marker is parsed, and path tricks are refused", () => {
  assert.deepEqual(parseDeletions("===DELETE: src/Old.jsx==="), ["src/Old.jsx"]);
  assert.deepEqual(parseDeletions("===DELETE: ../../etc/passwd==="), []);
  assert.deepEqual(parseDeletions("===DELETE: /etc/passwd==="), []);
  assert.deepEqual(parseDeletions("no markers here"), []);
});

// ── The exact scenario that was failing ─────────────────────

test("Fix works on a large project by sending one file", () => {
  // RestoBar Manager, reduced: main.jsx imports App.jsx, App.jsx does
  // not exist. Under the old rules the model had to re-emit all 29
  // files or be rejected. Now one file is enough.
  const broken = APP;                              // no src/App.jsx
  const reply = parseFiles(
    "Created the missing App component.\n" +
    "===FILE: src/App.jsx===\nexport default function App(){ return <div>hi</div>; }\n===ENDFILE===",
    "src/App.jsx"
  );

  const merged = applyEdit(broken, reply, []);
  assert.ok(merged.files.some((f) => f.path === "src/App.jsx"), "App.jsx should now exist");
  assert.equal(merged.files.length, 5, "and nothing else should have been lost");

  // And the guard must now accept it, where before it rejected
  // anything with fewer paths than the original.
  const verdict = betterOf("react", broken, merged.files);
  assert.deepEqual(verdict.lost, []);
  assert.ok(verdict.check.ok, verdict.check.errors);
});

test("the guard still catches a genuine deletion", () => {
  // Merging makes accidental loss impossible, but an explicit DELETE
  // of something still imported is a real mistake.
  const merged = applyEdit(APP, [], ["src/main.jsx"]);
  const verdict = betterOf("react", APP, merged.files);
  assert.deepEqual(verdict.lost, ["src/main.jsx"]);
  assert.equal(verdict.files.length, 4, "the original must survive");
});

// ── The instruction the model is given ──────────────────────

test("the contract tells the model omission is safe", () => {
  // Without this it re-emits everything out of caution, which is the
  // expensive behaviour we are trying to stop.
  assert.match(EDIT_CONTRACT, /ONLY the files you actually changed/i);
  assert.match(EDIT_CONTRACT, /LEFT EXACTLY AS THEY ARE/);
  assert.match(EDIT_CONTRACT, /===DELETE:/);
});

test("the contract asks for whole files, not patches", () => {
  // There is no patch applier here, and a model offering a unified
  // diff would silently produce nothing.
  assert.match(EDIT_CONTRACT, /output that whole file, complete/i);
  assert.match(EDIT_CONTRACT, /no patch format/i);
});

test("the contract warns about the failure that keeps happening", () => {
  assert.match(EDIT_CONTRACT, /if you referenced a file that does not exist yet, create it/i);
});

const LANE = fs.readFileSync(new URL("../src/lanes/inhouse.ts", import.meta.url), "utf8");

test("the auto-fix retry merges rather than replaces", () => {
  // This is what makes Fix land on a 29-file project.
  assert.match(LANE, /const attempt = applyEdit\(files, parseFiles\(fixed/);
});

test("a first build is not merged onto anything", () => {
  // There is nothing to merge onto, and treating it as a patch would
  // make an empty reply produce an empty project rather than an error.
  assert.match(LANE, /const isEdit = base\.length > 0;/);
});

test("the retry prompt no longer demands the complete project", () => {
  assert.doesNotMatch(LANE, /corrected COMPLETE project/);
  assert.match(LANE, /Everything you leave out is kept as it is/);
});

// ── What the user sees ──────────────────────────────────────

const PAGE = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("changed files are coloured, not just listed", () => {
  for (const c of ["ch-added", "ch-modified", "ch-removed"]) {
    assert.ok(PAGE.includes(c), `missing style for ${c}`);
  }
  assert.match(PAGE, /lastChange = \{/);
});

test("changed files sort to the front", () => {
  // On a 29-file project, the two that changed are the only ones
  // anybody wants to look at.
  assert.match(PAGE, /\.sort\(\(a, b\) => \(a\.kind \? 0 : 1\) - \(b\.kind \? 0 : 1\)\)/);
});

test("progress is reported from the stream itself", () => {
  // Not a percentage — nobody knows how many files the reply will
  // contain until it contains them — but the two real questions are
  // both answerable: is it moving, and how far in.
  assert.match(PAGE, /function showProgress/);
  assert.match(PAGE, /===FILE:/);
  assert.match(PAGE, /" of " \+ started\.length \+ " file"/);
});

test("an error that names a file offers to open it", () => {
  assert.match(PAGE, /function fileNamed/);
  assert.match(PAGE, /setBtn\(go, "code", "Show me"\)/);
});
