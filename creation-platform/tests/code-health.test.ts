import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  fileHealth, projectHealth, longFunctions, refactorPrompt,
  SIZE_RULES, FILE_LIMIT, FILE_COMFORTABLE, FN_COMFORTABLE,
} from "../src/codeHealth.js";
import { DESIGN_RULES } from "../src/design.js";
import { EDIT_CONTRACT } from "../src/lanes/inhouse.js";

// WHY SIZE IS MEASURED AND NOT JUST RECOMMENDED
//
// A file that keeps growing is what eventually breaks this platform,
// for a reason specific to how it works: every edit sends the file to
// the model and gets it back. A 1,200-line component is 1,200 lines in
// and 1,200 out for a two-line change — slow, expensive, and the most
// likely place for a reply to be cut off. The failure looks like a bad
// model. It is a bad file.
//
// So the limits are not style. They are the difference between an edit
// that lands and an edit that corrupts a project.

const lines = (n: number, text = "const x = 1;") =>
  Array.from({ length: n }, () => text).join("\n");

test("a small file is good", () => {
  const h = fileHealth({ path: "a.js", content: lines(80) });
  assert.equal(h.level, "good");
  assert.equal(h.advice, "", "nothing to say about a healthy file");
});

test("a file past the comfortable size is watched, not alarmed about", () => {
  const h = fileHealth({ path: "a.js", content: lines(FILE_COMFORTABLE + 50) });
  assert.equal(h.level, "watch");
  assert.match(h.advice, /still workable/i);
});

test("a file past the ceiling says why it matters", () => {
  // "Too long" is a style note. "Every edit sends and returns the whole
  // thing" is a reason to act.
  const h = fileHealth({ path: "a.js", content: lines(FILE_LIMIT + 200) });
  assert.equal(h.level, "over");
  assert.match(h.advice, /sends and returns the whole thing/i);
  assert.match(h.advice, /cut off/i);
});

test("line counts are exact", () => {
  assert.equal(fileHealth({ path: "a.js", content: "a\nb\nc" }).lines, 3);
});

// ── Function length ─────────────────────────────────────────

test("a long function is found and measured", () => {
  const body = "function huge() {\n" + lines(60, "  doThing();") + "\n}\n";
  const found = longFunctions(body);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.name, "huge");
  assert.ok(found[0]!.lines > FN_COMFORTABLE);
  assert.equal(found[0]!.line, 1, "it should report where the function starts");
});

test("a short function is not flagged", () => {
  assert.deepEqual(longFunctions("function ok() {\n  return 1;\n}\n"), []);
});

test("control flow is not mistaken for a function", () => {
  // if (…) { and for (…) { match a naive call-shaped pattern.
  const src = "function ok() {\n  if (a) {\n" + lines(40, "    x();") + "\n  }\n}\n";
  const found = longFunctions(src);
  assert.deepEqual(found.map((f) => f.name), ["ok"], "only the real function");
});

test("the longest offender comes first", () => {
  const src =
    "function small() {\n" + lines(30, "  a();") + "\n}\n" +
    "function big() {\n" + lines(90, "  b();") + "\n}\n";
  assert.equal(longFunctions(src)[0]!.name, "big");
});

test("a syntactically broken file still reports a size", () => {
  // This is exactly when someone most wants to know how big it is, so
  // degrading gracefully matters more than being precise.
  const h = fileHealth({ path: "a.jsx", content: "function x() {\n" + lines(600, "  y(") });
  assert.equal(h.level, "over");
  assert.ok(h.lines > FILE_LIMIT);
});

test("non-code files are sized but not analysed for functions", () => {
  const h = fileHealth({ path: "data.json", content: lines(700, '"a": 1,') });
  assert.equal(h.level, "over");
  assert.deepEqual(h.longFunctions, []);
});

// ── Project view ────────────────────────────────────────────

test("the worst files are the work queue, worst first", () => {
  const p = projectHealth([
    { path: "small.js", content: lines(50) },
    { path: "huge.js", content: lines(900) },
    { path: "big.js", content: lines(600) },
  ]);
  assert.deepEqual(p.worst.map((f) => f.path), ["huge.js", "big.js"]);
  assert.equal(p.totalLines, 1550);
});

test("a healthy project has an empty queue", () => {
  const p = projectHealth([{ path: "a.js", content: lines(100) }]);
  assert.deepEqual(p.worst, []);
});

// ── The prompt that fixes it ────────────────────────────────

test("the refactor prompt names the file and how to split it", () => {
  const h = fileHealth({
    path: "src/components/Dashboard.jsx",
    content: "function render() {\n" + lines(80, "  a();") + "\n}\n" + lines(600),
  });
  const p = refactorPrompt(h);
  assert.match(p, /src\/components\/Dashboard\.jsx/);
  assert.match(p, /One responsibility per file/i);
  assert.match(p, /src\/utils\//);
  // And it must name the actual offenders, not just say "split it".
  assert.match(p, /render\(\) — \d+ lines/);
});

test("the refactor prompt insists behaviour does not change", () => {
  // A refactor that quietly changes what the app does is worse than a
  // long file.
  const h = fileHealth({ path: "a.jsx", content: lines(900) });
  assert.match(refactorPrompt(h), /Behaviour must not change/i);
  assert.match(refactorPrompt(h), /create every file you reference/i);
});

// ── The rules reach the model ───────────────────────────────

test("the size rules state the reason, not just the number", () => {
  // A model will trade away "keep files small" under pressure. It can
  // act on "a big file is the one most likely to be truncated".
  assert.match(SIZE_RULES, new RegExp(String(FILE_LIMIT)));
  assert.match(SIZE_RULES, new RegExp(String(FN_COMFORTABLE)));
  assert.match(SIZE_RULES, /cut off mid-reply/i);
  assert.match(SIZE_RULES, /mechanical/i);
});

test("the rules warn against splitting for its own sake", () => {
  // Otherwise the cure is twenty 30-line files nobody can navigate.
  assert.match(SIZE_RULES, /splitting for its own sake/i);
});

test("the rules are in the design prompt and the edit contract", () => {
  assert.match(DESIGN_RULES, /FILE SIZE/);
  assert.match(EDIT_CONTRACT, /already past 500 lines/);
});

// ── What the user sees ──────────────────────────────────────

const PAGE = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("the size shows on every file tab", () => {
  // A number nobody can see is a number that grows.
  assert.match(PAGE, /n\.className = "len " \+ h\.level/);
  assert.match(PAGE, /#fileTabs \.len\.over/);
});

test("an oversized file offers the fix in one click", () => {
  assert.match(PAGE, /function renderHealthBar/);
  assert.match(PAGE, /setBtn\(go, "sparkles", "Split it up"\)/);
  assert.match(PAGE, /\$\("promptBox"\)\.value = health\.refactor/);
});

test("the size rule has one implementation, not two", () => {
  // A copy in the browser would drift from the one in the prompt.
  assert.match(PAGE, /fetch\("\/api\/code-health"/);
  assert.doesNotMatch(PAGE, /const FILE_LIMIT/);
});

// ── Live colouring ──────────────────────────────────────────

test("the stream is coloured as it arrives, not left as a grey wall", () => {
  // This is why edits looked like full rewrites even after they
  // stopped being full rewrites.
  assert.match(PAGE, /function doPaintStream/);
  assert.match(PAGE, /isNew \? "\+ new file  " : "~ changing  "/);
});

test("only finished files are diffed", () => {
  // Half a file diffs as "everything removed", which would be actively
  // misleading mid-stream.
  assert.match(PAGE, /const closed = \/\^===ENDFILE===\$\/m\.test\(body\)/);
  assert.match(PAGE, /if \(closed && !isNew\)/);
});

test("painting is throttled", () => {
  // A diff per chunk on a 500-line file drops frames.
  assert.match(PAGE, /if \(paintPending\) return;/);
});

test("the diff renderer is shared with the History tab", () => {
  // Two diff implementations is two sets of colour bugs.
  assert.match(PAGE, /renderDiff\(pre, before, after\)/);
});

// ── Fitting the screen ──────────────────────────────────────
// Reported from a generated game hub: the QUICK PLAY heading sat
// half-hidden behind the header, content ran under the bottom bar, and
// one nav item had an icon while four did not. Nothing threw — it
// rendered, and it looked broken.

test("the rules name the three causes of clipped layout", () => {
  // Absolute positioning in the flow, fixed heights on text, and a
  // bottom bar outside the flex column. Every clipped layout is one of
  // these three.
  assert.match(DESIGN_RULES, /NEVER position anything absolutely/);
  assert.match(DESIGN_RULES, /Never put a fixed height on anything containing text/);
  assert.match(DESIGN_RULES, /disappears under a bottom bar/);
});

test("the rules give the exact full-screen shape, not a principle", () => {
  // "Use flexbox properly" is advice. A layout to copy is a rule.
  assert.match(DESIGN_RULES, /flex flex-col h-screen/);
  assert.match(DESIGN_RULES, /flex-1 overflow-y-auto/);
  assert.match(DESIGN_RULES, /shrink-0/);
});

test("the rules cover the small-screen realities", () => {
  assert.match(DESIGN_RULES, /safe-area-inset-bottom/, "a bottom bar under the home indicator");
  assert.match(DESIGN_RULES, /line-clamp-2|truncate/, "long names must not push a layout sideways");
  assert.match(DESIGN_RULES, /360x640/, "there must be a concrete size to picture");
});

test("a nav bar cannot have one item with an icon and four without", () => {
  // Exactly what the screenshot showed, and it reads as a bug because
  // it is one.
  assert.match(DESIGN_RULES, /SAME structure: icon above label/);
});

test("tabs must lead somewhere", () => {
  // Five tabs and two screens is the other half of the same problem.
  assert.match(DESIGN_RULES, /NO dead tabs/);
  assert.match(DESIGN_RULES, /Every screen needs its own empty state/);
});
