import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebPreview } from "../src/services/webPreview.js";
import { DESIGN_RULES } from "../src/design.js";
import type { ProjectFile } from "../src/lib/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"),
  "utf8"
);

// ── Suggested prompts ───────────────────────────────────────
// Reported as: "our Pre-Suggested Prompts that are not showing up".
//
// advanceBrain() opened with `if (!brain...) return;`. Opening a
// project saved before the brain existed — or any project whose first
// plan failed — meant every subsequent build hit that return, so the
// suggestions never came back and there was no way to recover short
// of starting a new project.

test("a build with no plan drafts one instead of giving up", () => {
  const fn = HTML.match(/async function advanceBrain\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(fn, "advanceBrain not found");
  assert.match(fn, /await planBrain\(/, "must plan on demand, not return");
  // The old bug, precisely: a bare return before any attempt to plan.
  const firstLine = fn.split("\n").slice(1, 3).join("\n");
  assert.doesNotMatch(firstLine, /^\s*if \(![\s\S]*\) return;/m);
});

test("there is one path to advancing the plan, not two", () => {
  // The loaded-project case was missed because the call site had a
  // branch that only planned when there was no project yet.
  assert.doesNotMatch(HTML, /planBrain\(firstPrompt\)\.then/);
});

// ── Preview errors reach the platform ───────────────────────
// A missing export throws before anything renders, so the frame goes
// blank. The message existed but was trapped inside the iframe, where
// the parent cannot read it — the only way to act on one was to retype
// it into the prompt box by hand.

const PROJECT: ProjectFile[] = [
  { path: "package.json", content: '{"name":"r"}' },
  { path: "index.html", content: "<!DOCTYPE html><html><body><div id='root'></div></body></html>" },
  { path: "src/main.jsx", content: "console.log(1);\n" },
];

function previewHtml(): string {
  const wp = new WebPreview();
  wp.load(PROJECT);
  return wp.serve("/", "/live").body;
}

test("the preview posts its errors out to the parent", () => {
  const html = previewHtml();
  assert.match(html, /parent\.postMessage/);
  assert.match(html, /__preview: "error"/);
});

test("both throw styles are caught", () => {
  const html = previewHtml();
  assert.match(html, /addEventListener\("error"/);
  // A failed dynamic import or a throw inside an effect arrives as a
  // rejection, not an error event. Missing this is missing most of them.
  assert.match(html, /addEventListener\("unhandledrejection"/);
});

test("a silent blank render is reported too", () => {
  // Nothing thrown and nothing rendered is the worst case: no message
  // at all, just a white rectangle.
  assert.match(previewHtml(), /Nothing rendered/);
});

test("the message carries the file and line, not just the text", () => {
  const html = previewHtml();
  assert.match(html, /source:/);
  assert.match(html, /line:/);
});

test("a clean load clears the previous error", () => {
  // Otherwise a stale toast outlives the build that caused it, and the
  // user chases a bug that is already fixed.
  assert.match(previewHtml(), /__preview: "ok"/);
});

test("one error, not a cascade", () => {
  // A failed import usually triggers several downstream throws. Six
  // toasts for one cause is noise.
  assert.match(previewHtml(), /if \(reported\) return;/);
});

// ── The toast ───────────────────────────────────────────────

test("errors surface above the prompt box, in the suggestions slot", () => {
  // Jordi asked for it "exact same place" as the suggested prompts —
  // the spot your eye is already on when you are about to type.
  const alerts = HTML.indexOf('id="alerts"');
  const suggest = HTML.indexOf('id="suggest"');
  const input = HTML.indexOf('id="inputRow"');
  assert.ok(alerts > 0 && suggest > alerts && input > suggest,
    "expected order: alerts, suggestions, prompt box");
});

test("the toast listens for the preview's message", () => {
  assert.match(HTML, /window\.addEventListener\("message"/);
  assert.match(HTML, /d\.__preview !== "error"/);
});

test("the Fix prompt hands the agent the verbatim error", () => {
  // Paraphrasing loses the one thing that matters: the exact symbol
  // and file names in the message.
  const block = HTML.match(/fix:\s*\n?\s*"The preview is failing[\s\S]*?,\n/)?.[0] ?? "";
  assert.ok(block, "fix prompt not found");
  assert.match(block, /\+ raw \+/, "the raw message must be interpolated in");
});

test("a new build clears the previous build's error", () => {
  assert.match(HTML, /clearToasts\("preview"\)/);
});

test("a second error of the same kind replaces the first", () => {
  const fn = HTML.match(/function showToast\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /clearToasts\(kind\)/);
});

// ── History tab ─────────────────────────────────────────────

test("History is a third view, not a dropdown", () => {
  assert.match(HTML, /id="histTab"[^>]*role="tab"/);
  assert.match(HTML, /id="histWrap"/);
  // The old header dropdown duplicated it and crowded an already
  // overfull header.
  assert.doesNotMatch(HTML, /historySel/);
});

test("switching views is table-driven, so a fourth tab cannot be half-wired", () => {
  // The Preview/Code pair was hand-toggled, which is how the Code view
  // ended up with no way back out of it.
  assert.match(HTML, /const TABS = \{[^}]*history:/);
  assert.match(HTML, /for \(const \[name, id\] of Object\.entries\(TABS\)\)/);
});

test("each entry shows the prompt that produced it", () => {
  const fn = HTML.match(/function versionRow\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /querySelector\("\.prompt"\)\.textContent = v\.label/);
});

test("the diff is computed, not faked with a line count", () => {
  const fn = HTML.match(/function renderDiff\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /lcs/i, "expected a longest-common-subsequence diff");
  assert.match(fn, /Uint32Array/, "table should be typed, not an array of arrays");
});

test("version 1 diffs against nothing rather than crashing", () => {
  const fn = HTML.match(/async function fillDiff\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /n > 1 \? filesOf\(await loadVersion\(n - 1\)\) : \{\}/);
});

test("single-file targets are diffable too", () => {
  // Web projects keep their source in `code`, not in `files` — miss
  // this and the History tab is empty for exactly the target that
  // builds fastest.
  const fn = HTML.match(/function filesOf\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /if \(p\.code\)/);
});

test("version snapshots are fetched once", () => {
  // Each row needs version n and n-1; without a cache, opening five
  // rows is ten requests for six distinct snapshots.
  assert.match(HTML, /if \(versionCache\[n\]\) return versionCache\[n\]/);
  // And it must be dropped when the project changes, or one project's
  // diffs show up under another's.
  assert.match(HTML, /versionCache = \{\};/);
});

test("restoring is offered on old versions but not the current one", () => {
  const fn = HTML.match(/function versionRow\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /if \(!isHead\) \{[\s\S]*Restore this/);
});

// ── Demo data toggle ────────────────────────────────────────

test("the flag pattern the toggle rewrites matches what the rules ask for", () => {
  // These two have to agree exactly. If the prompt says one thing and
  // the regex expects another, the switch silently never appears.
  const re = /const DEMO_RE = (\/.*\/[a-z]*);/.exec(HTML)?.[1];
  assert.ok(re, "DEMO_RE not found");
  const rx = new RegExp(
    re!.slice(1, re!.lastIndexOf("/")),
    re!.slice(re!.lastIndexOf("/") + 1)
  );
  assert.match(DESIGN_RULES, /export const USE_DEMO_DATA = true;/);
  assert.ok(
    rx.test("export const USE_DEMO_DATA = true;"),
    "the toggle's regex does not match the line the design rules ask for"
  );
  assert.ok(rx.test("export const USE_DEMO_DATA = false;"));
});

test("flipping the switch rewrites only the flag", () => {
  const fn = HTML.match(/\$\("demoTgl"\)\.onchange[\s\S]*?\n\};/)?.[0] ?? "";
  assert.match(fn, /f\.content\.replace\(DEMO_RE/);
  // A toggle is not a build, so it must not create a restore point.
  assert.match(fn, /autoSave\(\{ silent: true \}\)/);
});

test("the toggle hides itself for projects that have no flag", () => {
  const fn = HTML.match(/function syncDemoToggle\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /style\.display = f \? "" : "none"/);
});

test("the toggle resyncs on every render", () => {
  // The flag lives inside the generated files, so loading a project or
  // restoring a version can change it underneath the switch.
  const fn = HTML.match(/function renderProject\(\) \{[\s\S]{0,200}/)?.[0] ?? "";
  assert.match(fn, /syncDemoToggle\(\)/);
});

test("the rules require the app to still work with demo data off", () => {
  // Otherwise the switch produces a broken app instead of an empty
  // one, which is worse than not having it.
  assert.match(DESIGN_RULES, /genuinely usable, not broken/i);
  assert.match(DESIGN_RULES, /NaN|0 rather than/);
});
