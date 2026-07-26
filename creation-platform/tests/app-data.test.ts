import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MemoryAppData, validCollection } from "../src/services/appData.js";
import { WebPreview } from "../src/services/webPreview.js";
import { DESIGN_RULES } from "../src/design.js";
import type { ProjectFile } from "../src/lib/files.js";

// Generated apps kept everything in localStorage, which is per-browser.
// The data cannot be reached from a phone, cannot be shared with staff,
// and dies with the browser profile — so "Employee Entering" was not a
// feature, it was a demo of one.
//
// Apps now get real server-side storage on window.db, reached through
// their own preview URL so the token in that URL is the credential.

test("records round-trip", async () => {
  const s = new MemoryAppData();
  await s.put("p1", "employees", [{ id: "a", name: "Rosa" }]);
  assert.deepEqual(await s.list("p1", "employees"), [{ id: "a", name: "Rosa" }]);
});

test("saving the same id twice is an edit, not a duplicate", async () => {
  const s = new MemoryAppData();
  await s.put("p1", "employees", [{ id: "a", name: "Rosa" }]);
  await s.put("p1", "employees", [{ id: "a", name: "Rosa Diaz" }]);
  const rows = await s.list("p1", "employees");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.name, "Rosa Diaz");
});

test("collections are separate", async () => {
  const s = new MemoryAppData();
  await s.put("p1", "employees", [{ id: "a" }]);
  await s.put("p1", "deliveries", [{ id: "a" }]);
  assert.equal((await s.list("p1", "employees")).length, 1);
  assert.equal((await s.list("p1", "deliveries")).length, 1);
});

test("projects cannot see each other's data", async () => {
  // The whole isolation story rests on this.
  const s = new MemoryAppData();
  await s.put("p1", "employees", [{ id: "a", name: "Rosa" }]);
  assert.deepEqual(await s.list("p2", "employees"), []);
});

test("removing takes one id or many", async () => {
  const s = new MemoryAppData();
  await s.put("p1", "x", [{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.equal(await s.remove("p1", "x", ["a", "c"]), 2);
  assert.deepEqual((await s.list("p1", "x")).map((r) => r.id), ["b"]);
});

test("removing something that is not there is not an error", async () => {
  const s = new MemoryAppData();
  assert.equal(await s.remove("p1", "x", ["nope"]), 0);
});

test("collection names are constrained", () => {
  // They land in a URL and a query, so anything clever is a bug.
  for (const ok of ["employees", "pickup_runs", "a", "x-1"]) {
    assert.ok(validCollection(ok), `${ok} should be allowed`);
  }
  for (const bad of ["", "../secrets", "a b", "1abc", "a".repeat(60), "emp;drop"]) {
    assert.ok(!validCollection(bad), `${bad} should be rejected`);
  }
});

// ── The wiring the app sees ─────────────────────────────────

const BASE: ProjectFile[] = [
  { path: "package.json", content: "{}" },
  { path: "index.html", content: "<html><body><div id='root'></div></body></html>" },
  { path: "src/main.jsx", content: "console.log(1);\n" },
];

function page(base = "/live/tok"): string {
  const wp = new WebPreview();
  wp.load(BASE);
  return wp.serve("/", base).body;
}

test("window.db is defined before the app runs", () => {
  // Apps read storage while initialising state, so a helper installed
  // after the entry module is installed too late.
  const html = page();
  assert.match(html, /window\.db = \{/);
  assert.ok(html.indexOf("window.db") < html.indexOf('<script type="module"'));
});

test("db calls stay inside the preview's own token path", () => {
  // Anything else would mean handing generated code a credential.
  const html = page("/live/abc123");
  assert.match(html, /"\/live\/abc123" \+ "\/__data\/"/);
});

test("db exposes exactly the four things the rules promise", () => {
  const html = page();
  for (const m of ["list:", "save:", "remove:", "get ready()"]) {
    assert.ok(html.includes(m), `window.db is missing ${m}`);
  }
});

test("a storage failure is visible, not swallowed", () => {
  // An app that silently drops what someone typed is worse than one
  // that says it cannot save.
  const html = page();
  assert.match(html, /failed = true;/);
  assert.match(html, /throw new Error/);
});

test("the rules tell the model to use db and not localStorage", () => {
  assert.match(DESIGN_RULES, /window\.db/);
  assert.match(DESIGN_RULES, /Do NOT use localStorage for real records/);
  assert.match(DESIGN_RULES, /db\.ready/);
  // And to handle the failure rather than pretending it saved.
  assert.match(DESIGN_RULES, /never silently lose what the user typed/i);
});

// ── The route ───────────────────────────────────────────────

const LIVE = fs.readFileSync(new URL("../src/routes/live.ts", import.meta.url), "utf8");

test("the project id comes from the running preview, never the request", () => {
  // A generated app must not be able to name someone else's project,
  // and the simplest way to guarantee that is never to ask it.
  assert.match(LIVE, /const projectId = previewRunner\.projectId\(\);/);
  assert.doesNotMatch(LIVE, /req\.(body|params|query)\.projectId/);
});

test("an unsaved project is told plainly that it has nowhere to save", () => {
  assert.match(LIVE, /409/);
  assert.match(LIVE, /has not been saved yet/);
});

test("the data route parses its own body", () => {
  // liveRouter is mounted before express.json(), because the proxy
  // needs the raw stream. Without this, every save read undefined.
  assert.match(LIVE, /async function readJsonBody/);
  assert.match(LIVE, /await readJsonBody\(req\)/);
});

test("the body has a size cap", () => {
  assert.match(LIVE, /LIMIT = 2 \* 1024 \* 1024/);
});

test("every record must carry an id", () => {
  assert.match(LIVE, /Every record needs an id/);
});
