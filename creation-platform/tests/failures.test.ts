import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FAILURES, classify, openFailures } from "../src/failures.js";
import { buildDoc, DOC_PATH } from "../scripts/build-failure-doc.js";
import { WebPreview } from "../src/services/webPreview.js";
import type { ProjectFile } from "../src/lib/files.js";

// The catalogue exists because "it did not render a preview" is about
// thirty different bugs that all look like a blank frame. These tests
// keep it honest: the signatures must actually match real messages,
// the doc must match the registry, and the entries must not collide.

test("every failure mode is uniquely identified", () => {
  const ids = FAILURES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
});

test("every entry says what causes it and what to do", () => {
  for (const f of FAILURES) {
    assert.ok(f.cause.length > 40, `${f.id}: cause is too thin to be useful`);
    assert.ok(f.fix.length > 20, `${f.id}: fix is too thin to act on`);
    assert.ok(f.title.length > 10, `${f.id}: title should read as a sentence`);
  }
});

test("titles are in plain language, not error text", () => {
  // The whole point is to translate. A title that quotes the engine
  // has not translated anything.
  for (const f of FAILURES) {
    assert.doesNotMatch(f.title, /undefined|null|TypeError|SyntaxError|\bERR_/,
      `${f.id}: title reads like a stack trace`);
  }
});

// ── The signatures actually match real messages ─────────────
// A regex that matches nothing is worse than no regex: it looks like
// coverage and provides none.

const REAL_MESSAGES: Array<[string, string]> = [
  ["missing-export", "Uncaught SyntaxError: The requested module './components/icons.jsx' does not provide an export named 'IconUtensils'"],
  ["unresolved-specifier", "TypeError: Failed to resolve module specifier 'date-fns'. Relative references must start with either '/', './', or '../'."],
  ["module-fetch-failed", "TypeError: Failed to fetch dynamically imported module: https://esm.sh/recharts@9.9.9"],
  ["invalid-hook-call", "Error: Invalid hook call. Hooks can only be called inside of the body of a function component."],
  ["css-module-import", 'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/css".'],
  ["no-mount-node", "Error: Target container is not a DOM element."],
  ["nothing-rendered", "Nothing rendered. The entry module ran but produced no output"],
  ["render-loop", "Error: Maximum update depth exceeded."],
  ["conditional-hooks", "Error: Rendered more hooks than during the previous render."],
  ["undefined-property", "TypeError: Cannot read properties of undefined (reading 'map')"],
  ["object-as-child", "Error: Objects are not valid as a React child (found: object with keys {id, name})."],
  ["node-globals", "ReferenceError: process is not defined"],
  ["storage-blocked", "SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document."],
  ["network-call", "TypeError: Failed to fetch"],
  ["truncated-output", "SyntaxError: Unexpected end of input"],
  ["provider-rate-limit", "429 rate_limit_error: Number of requests has exceeded your limit"],
  ["provider-overloaded", "529 overloaded_error"],
  ["version-collision", 'duplicate key value violates unique constraint "project_versions_unique_version" (23505)'],
];

for (const [id, message] of REAL_MESSAGES) {
  test(`"${id}" recognises a real message`, () => {
    const hit = classify(message);
    assert.ok(hit, `nothing matched: ${message}`);
    assert.equal(hit!.id, id,
      `matched "${hit!.id}" instead — check ordering, the first match wins`);
  });
}

test("a message we have never seen classifies as unknown, not as the wrong thing", () => {
  // A greedy signature that swallows everything is the failure mode of
  // a failure catalogue.
  assert.equal(classify("Something entirely unrelated happened at 4pm"), null);
  assert.equal(classify(""), null);
});

test("the generic 'not defined' entry does not shadow the Node-globals one", () => {
  // "process is not defined" matches both patterns. Ordering plus a
  // lookahead decide it; if either regresses, the user gets advice
  // about a missing import when the real problem is Node code in a
  // browser.
  assert.equal(classify("ReferenceError: require is not defined")!.id, "node-globals");
  assert.equal(classify("ReferenceError: Sidebar is not defined")!.id, "not-defined");
});

// ── The doc cannot drift ────────────────────────────────────

test("docs/failure-catalogue.md is up to date", () => {
  assert.ok(fs.existsSync(DOC_PATH), "run: npx tsx scripts/build-failure-doc.ts");
  assert.equal(
    fs.readFileSync(DOC_PATH, "utf8"),
    buildDoc(),
    "the catalogue changed — regenerate with: npx tsx scripts/build-failure-doc.ts"
  );
});

test("the doc names the open items as the work queue", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.match(doc, /## Still open/);
  for (const f of openFailures()) assert.ok(doc.includes(f.id), `${f.id} missing from the doc`);
});

// ── The bugs found while writing the catalogue ──────────────

const BASE: ProjectFile[] = [
  { path: "package.json", content: '{"name":"r"}' },
  { path: "index.html", content: "<!DOCTYPE html><html><body></body></html>" },
];

function html(files: ProjectFile[]): string {
  const wp = new WebPreview();
  wp.load(files);
  return wp.serve("/", "/live").body;
}

test("the render deadline is longer than a cold package download", () => {
  // Was 1.5s. Packages are fetched from a CDN at runtime, and a cold
  // fetch of react + react-dom + a chart library routinely exceeds
  // that — so a healthy app that was still downloading was told it
  // had rendered nothing. A false failure is worse than no message:
  // it sends you hunting a bug that does not exist.
  const out = html([...BASE, { path: "src/main.jsx", content: "console.log(1);\n" }]);
  const deadline = Number(/\}, (\d+)\);/.exec(out)?.[1] ?? 0);
  assert.ok(deadline >= 8000, `render deadline is ${deadline}ms — too short for a cold CDN fetch`);
});

test("a render is detected the moment it happens, not only at the deadline", () => {
  assert.match(html([...BASE, { path: "src/main.jsx", content: "x\n" }]), /MutationObserver/);
});

test("a module that never evaluated is not blamed on the component", () => {
  // "check that your component returns markup" is actively misleading
  // when the real problem is a package that would not download.
  const out = html([...BASE, { path: "src/main.jsx", content: "x\n" }]);
  assert.match(out, /__entryRan/);
  assert.match(out, /entry module never finished loading/);
});

test("the entry module is marked so we know it ran", () => {
  const wp = new WebPreview();
  wp.load([...BASE, { path: "src/main.jsx", content: "console.log(1);\n" }]);
  assert.match(wp.serve("/src/main.jsx", "/live").body, /window\.__entryRan = true/);
  // Only the entry — every module carrying the marker tells us nothing.
  wp.load([...BASE,
    { path: "src/main.jsx", content: "console.log(1);\n" },
    { path: "src/Other.jsx", content: "export default () => null;\n" }]);
  assert.doesNotMatch(wp.serve("/src/Other.jsx", "/live").body, /__entryRan/);
});

test("the mount div matches the id the app actually asks for", () => {
  // The page hardcoded <div id="root">. An entry calling
  // getElementById("app") got null, and React threw "Target container
  // is not a DOM element" — a confusing error for a naming mismatch.
  const out = html([...BASE, {
    path: "src/main.jsx",
    content: "createRoot(document.getElementById('app')).render(<App/>);\n",
  }]);
  assert.match(out, /<div id="app"><\/div>/);
  assert.doesNotMatch(out, /<div id="root">/);
});

test("root stays the default when nothing says otherwise", () => {
  assert.match(html([...BASE, { path: "src/main.jsx", content: "console.log(1);\n" }]),
    /<div id="root"><\/div>/);
});

test("an entry named something unexpected is still found", () => {
  // Was src/main.* and src/index.* only, so a project whose entry sat
  // at the root — or that mounted from a differently named file — got
  // a 500 that read as a platform fault rather than a naming one.
  for (const p of ["main.jsx", "src/App.jsx"]) {
    const wp = new WebPreview();
    wp.load([...BASE, { path: p, content: "console.log(1);\n" }]);
    assert.equal(wp.serve("/", "/live").status, 200, `${p} was not found as an entry`);
  }
});

test("a file that mounts React is treated as the entry whatever it is called", () => {
  const wp = new WebPreview();
  wp.load([...BASE, {
    path: "src/bootstrap.jsx",
    content: "import { createRoot } from 'react-dom/client';\ncreateRoot(document.body).render(null);\n",
  }]);
  const out = wp.serve("/", "/live");
  assert.equal(out.status, 200);
  assert.match(out.body, /src\/bootstrap\.jsx/);
});

test("storage works inside the sandboxed frame", () => {
  // The preview has an opaque origin, where localStorage THROWS rather
  // than returning null. Apps are told to persist state, so every one
  // of them died on first render — and because the throw happened in a
  // useState initialiser it surfaced as an unrelated React error.
  const out = html([...BASE, { path: "src/main.jsx", content: "x\n" }]);
  assert.match(out, /localStorage/);
  assert.match(out, /sessionStorage/);
  assert.match(out, /Object\.defineProperty\(window, name/);
});

test("the shim is installed before the app runs", () => {
  // Apps read storage while initialising state, so a shim that loads
  // after the entry module is a shim that loads too late.
  const out = html([...BASE, { path: "src/main.jsx", content: "x\n" }]);
  assert.ok(out.indexOf("Storage shim") < out.indexOf('<script type="module"'),
    "the shim must be installed before the entry module");
});

test("the sandbox is not weakened to make storage work", () => {
  // allow-same-origin would fix it and is the wrong trade: this frame
  // runs freshly generated code and must not reach the platform.
  const page = fs.readFileSync(
    new URL("../public/index.html", import.meta.url), "utf8"
  );
  const live = /iframe id="preview" sandbox="([^"]*)"/.exec(page)?.[1] ?? "";
  assert.doesNotMatch(live, /allow-same-origin/,
    "the preview frame must stay cross-origin");
});
