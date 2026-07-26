import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  extractContracts, contractViolations, contractDiff, contractBrief, resolveImport,
} from "../src/services/contracts.js";
import { checkProject } from "../src/lib/check.js";
import type { ProjectFile } from "../src/lib/files.js";

// Splitting a big file is the most dangerous edit this platform makes.
// Everything else adds; a refactor MOVES things, and every move is a
// chance to drop something outside the edited file that depended on a
// name. The app still compiles, the preview still loads, and a storage
// collection is quietly spelled differently — which is indistinguish-
// able from data loss to whoever is using the app.
//
// So the contracts are extracted, stated in the prompt as invariants,
// and checked afterwards.

const APP: ProjectFile[] = [
  {
    path: "src/App.jsx",
    content: `
import { formatMoney, parseWeight } from './utils/calc.js';
import Nav from './components/Nav.jsx';
export default function App() {
  const rows = db.list('employees');
  db.save('deliveries', x);
  localStorage.setItem('restobar.tab', tab);
  return <Route path="/dashboard" />;
}`,
  },
  {
    path: "src/utils/calc.js",
    content: "export const formatMoney = (n) => n;\nexport function parseWeight(w) { return w; }\n",
  },
  { path: "src/components/Nav.jsx", content: "export default function Nav() { return null; }\n" },
];

test("storage collections are found — they are database keys", () => {
  const c = extractContracts(APP);
  assert.deepEqual(c.collections, ["deliveries", "employees"]);
});

test("routes, saved settings and exports are found", () => {
  const c = extractContracts(APP);
  assert.deepEqual(c.routes, ["/dashboard"]);
  assert.deepEqual(c.storageKeys, ["restobar.tab"]);
  assert.deepEqual(c.exports["src/utils/calc.js"]!.sort(), ["formatMoney", "parseWeight"]);
  assert.deepEqual(c.exports["src/components/Nav.jsx"], ["default"]);
});

test("named and default imports are both recorded", () => {
  const c = extractContracts(APP);
  const imps = c.imports["src/App.jsx"]!;
  assert.deepEqual(imps.find((i) => i.from.includes("calc"))!.names.sort(), ["formatMoney", "parseWeight"]);
  assert.deepEqual(imps.find((i) => i.from.includes("Nav"))!.names, ["default"]);
});

test("relative imports resolve the way the browser would", () => {
  const paths = new Set(APP.map((f) => f.path));
  assert.equal(resolveImport("src/App.jsx", "./utils/calc.js", paths), "src/utils/calc.js");
  assert.equal(resolveImport("src/App.jsx", "./components/Nav", paths), "src/components/Nav.jsx");
  assert.equal(resolveImport("src/App.jsx", "react", paths), null, "a package is not a project file");
});

// ── The failure a refactor actually causes ──────────────────

test("an import naming a symbol its source no longer exports is caught", () => {
  // checkProject already checks the FILE exists. This is the next
  // failure along: the file is there, the symbol moved out of it, and
  // nothing notices until the browser throws.
  const moved: ProjectFile[] = [
    APP[0]!,
    { path: "src/utils/calc.js", content: "export const formatMoney = (n) => n;\n" }, // parseWeight gone
    APP[2]!,
  ];
  const v = contractViolations(moved);
  assert.equal(v.length, 1);
  assert.equal(v[0]!.file, "src/App.jsx");
  assert.match(v[0]!.message, /parseWeight/);
  assert.match(v[0]!.message, /does not export it/);
});

test("a clean project has no violations", () => {
  assert.deepEqual(contractViolations(APP), []);
});

test("a missing default export is caught too", () => {
  const broken: ProjectFile[] = [
    APP[0]!, APP[1]!,
    { path: "src/components/Nav.jsx", content: "export function Nav() { return null; }\n" },
  ];
  const v = contractViolations(broken);
  assert.equal(v.length, 1);
  assert.match(v[0]!.message, /default export/);
});

test("package imports are not treated as project files", () => {
  const withPkg: ProjectFile[] = [
    { path: "src/x.jsx", content: "import { useState } from 'react';\nexport const x = 1;\n" },
  ];
  assert.deepEqual(contractViolations(withPkg), []);
});

test("the build check now includes it", () => {
  const moved: ProjectFile[] = [
    { path: "index.html", content: '<html><body><div id="root"></div></body></html>' },
    { path: "package.json", content: '{"dependencies":{"react":"18.3.1","react-dom":"18.3.1"}}' },
    { path: "src/main.jsx", content: "import { go } from './helpers.js';\ngo();\n" },
    { path: "src/helpers.js", content: "export const stop = () => {};\n" },
  ];
  const r = checkProject("react", moved);
  assert.ok(!r.ok);
  assert.match(r.errors, /does not export it/);
});

// ── What disappeared between two versions ───────────────────

test("a renamed collection is reported as the serious one", () => {
  // The app compiles, the preview loads, and every existing record is
  // now invisible. Silent, and the worst of the three surfaces.
  const before = extractContracts(APP);
  const after = extractContracts([
    { ...APP[0]!, content: APP[0]!.content.replace("'employees'", "'staff'") },
    APP[1]!, APP[2]!,
  ]);
  const losses = contractDiff(before, after);
  const c = losses.find((l) => l.kind === "collection");
  assert.ok(c, "a renamed collection must be reported");
  assert.equal(c!.name, "employees");
  assert.match(c!.why, /looks exactly like data loss/i);
});

test("a dropped route and a dropped setting are reported", () => {
  const before = extractContracts(APP);
  const after = extractContracts([
    { ...APP[0]!, content: APP[0]!.content.replace('path="/dashboard"', "").replace(/localStorage[^\n]*\n/, "") },
    APP[1]!, APP[2]!,
  ]);
  const kinds = contractDiff(before, after).map((l) => l.kind);
  assert.ok(kinds.includes("route"));
  assert.ok(kinds.includes("storage"));
});

test("MOVING an export between files is not a loss", () => {
  // This is the whole point. A refactor that relocates code correctly
  // must produce zero findings, or the warning is noise and gets
  // ignored — including the time it matters.
  const before = extractContracts(APP);
  const after = extractContracts([
    APP[0]!,
    { path: "src/utils/calc.js", content: "export const formatMoney = (n) => n;\n" },
    { path: "src/utils/weight.js", content: "export function parseWeight(w) { return w; }\n" },
    APP[2]!,
  ]);
  assert.deepEqual(contractDiff(before, after), []);
});

test("splitting a file into three changes nothing that matters", () => {
  const before = extractContracts(APP);
  const after = extractContracts([
    { path: "src/App.jsx", content: APP[0]!.content },
    { path: "src/utils/money.js", content: "export const formatMoney = (n) => n;\n" },
    { path: "src/utils/weight.js", content: "export function parseWeight(w) { return w; }\n" },
    APP[2]!,
  ]);
  assert.deepEqual(contractDiff(before, after), []);
});

test("a default export moving is never reported", () => {
  // Every file has one; tracking movement of "default" would fire on
  // every split ever made.
  const before = extractContracts(APP);
  const after = extractContracts([APP[0]!, APP[1]!]);
  assert.ok(!contractDiff(before, after).some((l) => l.name === "default"));
});

// ── The brief that goes in the prompt ───────────────────────

test("the brief names the actual collections, routes and keys", () => {
  // A model splitting a 700-line file has no way to know 'employees'
  // is a storage key rather than a variable unless it is told.
  const b = contractBrief(extractContracts(APP));
  assert.match(b, /db\.list\('employees'\)/);
  assert.match(b, /\/dashboard/);
  assert.match(b, /restobar\.tab/);
});

test("the brief says moving is fine and renaming is not", () => {
  const b = contractBrief(extractContracts(APP));
  assert.match(b, /Moving them between files is fine/i);
  assert.match(b, /indistinguishable from data loss|indistinguishable|invisible to the app/i);
});

test("the brief covers the invisible contracts too", () => {
  // Record field names and component props break silently: the thing
  // renders, the value is undefined.
  const b = contractBrief(extractContracts(APP));
  assert.match(b, /Field names inside stored records/i);
  assert.match(b, /Component props keep their names/i);
});

test("an empty project produces a brief with no invented invariants", () => {
  const b = contractBrief(extractContracts([]));
  assert.match(b, /MUST NOT CHANGE/);
  assert.doesNotMatch(b, /db\.list/);
});

// ── Wiring ──────────────────────────────────────────────────

const LANE = fs.readFileSync(new URL("../src/lanes/inhouse.ts", import.meta.url), "utf8");
const SERVER = fs.readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
const PAGE = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("contracts are compared on every edit, not only on refactors", () => {
  // Any edit can drop a route. Restricting the check to refactors
  // would miss most of the cases.
  assert.match(LANE, /if \(isEdit\) \{[\s\S]{0,200}contractDiff\(extractContracts\(base\), extractContracts\(files\)\)/);
});

test("the refactor prompt carries the invariants", () => {
  assert.match(SERVER, /contractBrief\(extractContracts\(files \?\? \[\]\)\)/);
});

test("losses reach the user with a fix, not just a warning", () => {
  assert.match(PAGE, /event\.type === "contracts"/);
  assert.match(PAGE, /removed something other parts of the app relied on/);
  assert.match(PAGE, /Put them back exactly as they were spelled/);
});

test("the collection loss is the one promoted to the headline", () => {
  // Three kinds can be lost; only one silently orphans real data.
  assert.match(PAGE, /contractLosses\.find\(\(l\) => l\.kind === "collection"\)/);
});
