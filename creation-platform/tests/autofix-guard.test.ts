import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { betterOf } from "../src/lanes/inhouse.js";
import { checkProject } from "../src/lib/check.js";
import type { ProjectFile } from "../src/lib/files.js";

// THE BUG THIS PINS DOWN
//
// The auto-fix pass checked the generated project, and when it found
// errors it asked the model for a correction. It then accepted that
// correction on one condition — that it contained at least one file.
// It never re-checked it.
//
// So a truncated reply silently REPLACED a working project with a
// broken one, and the build still reported "Updated!".
//
// Observed in production: RestoBar Manager carried src/App.jsx through
// version 10. The correction at version 11 came back without it. Five
// further builds were made on top of a project whose entry module
// imported a file that no longer existed, and nothing ever said so.

const HTML = { path: "index.html", content: '<!DOCTYPE html><html><body><div id="root"></div></body></html>' };
const PKG = {
  path: "package.json",
  content: JSON.stringify({ dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" } }),
};
const MAIN = {
  path: "src/main.jsx",
  content: "import App from './App.jsx';\nconsole.log(App);\n",
};
const APP = { path: "src/App.jsx", content: "export default function App(){ return <div>hi</div>; }\n" };
const EXTRA = { path: "src/Nav.jsx", content: "export default () => <nav/>;\n" };

const WORKING: ProjectFile[] = [HTML, PKG, MAIN, APP];
/** Exactly the shape RestoBar Manager ended up in. */
const BROKEN: ProjectFile[] = [HTML, PKG, MAIN];

test("the fixture reproduces the real failure", () => {
  // If this stops holding, every test below is testing nothing.
  assert.ok(checkProject("react", WORKING).ok, "the good project should pass");
  const bad = checkProject("react", BROKEN);
  assert.ok(!bad.ok);
  assert.match(bad.errors, /do not exist/i);
});

test("a correction that drops a file is rejected outright", () => {
  // This is the exact regression. Deleting a file nothing asked to
  // delete is never the fix, however plausible the rest looks.
  const v = betterOf("react", WORKING, [HTML, PKG, MAIN]);
  assert.deepEqual(v.files, WORKING, "the working project must survive");
  assert.deepEqual(v.lost, ["src/App.jsx"]);
});

test("dropped files are named, not just counted", () => {
  const v = betterOf("react", [...WORKING, EXTRA], [HTML, PKG, MAIN]);
  assert.deepEqual(v.lost.sort(), ["src/App.jsx", "src/Nav.jsx"]);
});

test("an empty correction is not a correction", () => {
  // The old gate was `length > 0`, which is the only part of this the
  // original code got right.
  const v = betterOf("react", WORKING, []);
  assert.deepEqual(v.files, WORKING);
});

test("a correction that actually fixes the project is accepted", () => {
  // The guard must not be so strict that the auto-fix pass stops
  // working — that would trade one silent failure for another.
  const v = betterOf("react", BROKEN, [HTML, PKG, MAIN, APP]);
  assert.ok(v.check.ok, "the repaired project should pass");
  assert.equal(v.files.length, 4);
  assert.deepEqual(v.lost, []);
});

test("adding files is fine — only losing them is suspicious", () => {
  const v = betterOf("react", BROKEN, [HTML, PKG, MAIN, APP, EXTRA]);
  assert.ok(v.check.ok);
  assert.equal(v.files.length, 5);
});

test("when both versions are broken, the less broken one wins", () => {
  const alsoBad: ProjectFile[] = [
    HTML, PKG, MAIN,
    { path: "src/Other.jsx", content: "import './Ghost.jsx';\n" },
  ];
  // The candidate adds a second unresolved import, so it is worse.
  const v = betterOf("react", BROKEN, alsoBad);
  assert.equal(v.files.length, 3, "the original had fewer problems");
});

test("a tie keeps the original, so a retry cannot churn sideways", () => {
  const equallyBad: ProjectFile[] = [
    HTML, PKG,
    { path: "src/main.jsx", content: "import App from './Missing.jsx';\nconsole.log(App);\n" },
  ];
  const v = betterOf("react", BROKEN, equallyBad);
  assert.equal(v.files[2]!.content, MAIN.content, "expected the original entry");
});

test("a project that never had files is not protected into staying empty", () => {
  const v = betterOf("react", [], WORKING);
  assert.equal(v.files.length, 4);
  assert.ok(v.check.ok);
});

// ── It has to be reported, not just prevented ───────────────

test("the lane emits an unhealthy event when the result is broken", () => {
  const src = fs.readFileSync(new URL("../src/lanes/inhouse.ts", import.meta.url), "utf8");
  assert.match(src, /yield \{ type: "unhealthy"/);
  assert.match(src, /if \(!residual\.ok\)/,
    "a build that ends broken must say so, not just quietly keep the old files");
});

test("the retry asks for the smallest set of files, not the whole project", () => {
  // This assertion used to be the opposite — the retry warned that
  // omitted files would be deleted, because they were. Once edits
  // became merges, demanding the complete project was the thing
  // making Fix impossible on a large one: no reply short of all 29
  // files was ever accepted.
  const src = fs.readFileSync(new URL("../src/lanes/inhouse.ts", import.meta.url), "utf8");
  assert.match(src, /Everything you leave out is kept as it is/);
  assert.match(src, /smallest set of files/);
  assert.doesNotMatch(src, /will be DELETED from the project/);
});

test("the client stops claiming success over a broken project", () => {
  const page = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(page, /event\.type === "unhealthy"/);
  // "Updated!" must be conditional now.
  assert.match(page, /if \(unhealthy\) \{[\s\S]{0,400}still has problems/);
});

// ── The sandbox hole found alongside it ─────────────────────

test("the preview frame never gets allow-same-origin", () => {
  // /live is served from the platform's own origin. allow-same-origin
  // next to allow-scripts lets generated code reach parent.document,
  // the session cookie, and the API as the signed-in user. Chrome
  // warns about this exact pairing, which is how it surfaced.
  const page = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const grants = [...page.matchAll(/sandbox["'\s,]+["']([^"']*allow-scripts[^"']*)["']/g)]
    .map((m) => m[1]!);
  assert.ok(grants.length > 0, "no sandbox attributes found — did the selector change?");
  for (const g of grants) {
    assert.doesNotMatch(g, /allow-same-origin/,
      `a scripted frame was granted same-origin access: "${g}"`);
  }
});
