import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE, REACT_VERSION, inCatalogue, importMapFor, catalogueRules,
} from "../src/packages.js";
import { checkProject } from "../src/lib/check.js";
import { WebPreview } from "../src/services/webPreview.js";
import { DESIGN_RULES } from "../src/design.js";
import type { ProjectFile } from "../src/lib/files.js";

// Generated apps could import anything. The model supplied both the
// package name and the version from memory, and both were guesses — so
// a build could fail because a package was never published, or a
// version was invented, or a real package dragged in its own React.
// All three surfaced in the browser as network errors, long after the
// generation that chose them.
//
// A pinned catalogue turns "does this exist?" from a recollection into
// a lookup. This is what Bolt and Lovable do.

test("every version is exact — a range is how you get a surprise", () => {
  for (const p of CATALOGUE) {
    assert.match(p.version, /^\d+\.\d+\.\d+$/, `${p.name} is not pinned: ${p.version}`);
  }
});

test("react and react-dom agree, always", () => {
  // Two React copies is "invalid hook call", the classic crash.
  for (const n of ["react", "react-dom"]) {
    assert.equal(CATALOGUE.find((p) => p.name === n)?.version, REACT_VERSION);
  }
});

test("every entry says what it is for, because that text goes in the prompt", () => {
  for (const p of CATALOGUE) {
    assert.ok(p.use.length > 20, `${p.name} needs a real description`);
  }
});

test("no duplicates", () => {
  const names = CATALOGUE.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
});

// ── The import map ──────────────────────────────────────────

test("react is always present, declared or not", () => {
  const m = importMapFor({});
  assert.match(m["react"]!, /react@18\.3\.1/);
  assert.match(m["react-dom"]!, /react-dom@18\.3\.1/);
  assert.ok(m["react/jsx-runtime"], "the automatic JSX runtime must resolve");
});

test("the catalogue's version wins over whatever package.json claims", () => {
  // The whole point: a version the model invented cannot take effect.
  const m = importMapFor({ recharts: "^9.9.9" });
  assert.match(m["recharts"]!, /recharts@2\.12\.7/);
  assert.doesNotMatch(m["recharts"]!, /9\.9\.9/);
});

test("third-party React libraries are pinned to our React", () => {
  const m = importMapFor({ recharts: "", "lucide-react": "" });
  for (const n of ["recharts", "lucide-react"]) {
    assert.match(m[n]!, /deps=react@18\.3\.1,react-dom@18\.3\.1/, `${n} is not pinned`);
  }
});

test("react itself does not carry ?deps=react", () => {
  // It IS react. Pinning it to itself is how you get two copies.
  assert.doesNotMatch(importMapFor({})["react"]!, /deps=/);
});

test("an uncatalogued package resolves to an explanation, not a 404", () => {
  // Leaving it out gives "Failed to resolve module specifier", which
  // says nothing about why and looks exactly like a typo.
  const m = importMapFor({ "some-invented-lib": "^1.0.0" });
  const entry = m["some-invented-lib"];
  assert.ok(entry, "an unknown package must still get an entry");
  assert.match(entry!, /^data:text\/javascript,/);
  const body = decodeURIComponent(entry!.slice("data:text/javascript,".length));
  assert.match(body, /throw new Error/);
  assert.match(body, /some-invented-lib/, "the message must name the package");
  assert.match(body, /lucide-react/, "and list what IS available");
});

test("only declared packages are loaded", () => {
  // Injecting all nine into every project would mean nine CDN fetches
  // for an app that uses none of them.
  const m = importMapFor({});
  assert.ok(!m["papaparse"], "papaparse was never asked for");
});

// ── Caught before the browser ───────────────────────────────

const BASE: ProjectFile[] = [
  { path: "index.html", content: '<html><body><div id="root"></div></body></html>' },
  { path: "src/main.jsx", content: "console.log(1);\n" },
];

function withDeps(deps: Record<string, string>): ProjectFile[] {
  return [...BASE, { path: "package.json", content: JSON.stringify({ dependencies: deps }) }];
}

test("an uncatalogued dependency fails the build check", () => {
  // Caught at generation, where the auto-fix loop can act on it —
  // rather than in the browser minutes later, looking like a network
  // problem rather than a wrong choice.
  const r = checkProject("react", withDeps({ react: "18.3.1", "react-dom": "18.3.1", axios: "^1.7.0" }));
  assert.ok(!r.ok);
  assert.match(r.errors, /axios/);
  assert.match(r.errors, /not available/i);
  assert.match(r.errors, /lucide-react/, "the error must say what IS allowed");
});

test("a catalogued dependency passes", () => {
  const r = checkProject("react", withDeps({
    react: "18.3.1", "react-dom": "18.3.1", recharts: "2.12.7", "date-fns": "3.6.0",
  }));
  assert.ok(r.ok, r.errors);
});

test("a wrong version is not an error — the platform pins it anyway", () => {
  // Failing here would send the model chasing a number that has no
  // effect on what actually loads.
  const r = checkProject("react", withDeps({ react: "^18.0.0", "react-dom": "^18.0.0", clsx: "^2.0.0" }));
  assert.ok(r.ok, r.errors);
});

test("a malformed package.json is not reported twice", () => {
  const r = checkProject("react", [...BASE, { path: "package.json", content: "{ not json" }]);
  assert.ok(!r.ok);
  assert.doesNotMatch(r.errors, /not available/i);
});

// ── End to end through the preview ──────────────────────────

test("the served page builds its import map from the catalogue", () => {
  const wp = new WebPreview();
  wp.load(withDeps({ recharts: "^99.0.0" }));
  const html = wp.serve("/", "/live/t").body;
  assert.match(html, /recharts@2\.12\.7/);
  assert.doesNotMatch(html, /99\.0\.0/);
});

test("one react version reaches the browser", () => {
  const wp = new WebPreview();
  wp.load(withDeps({ recharts: "2.12.7", "lucide-react": "0.454.0" }));
  const html = wp.serve("/", "/live/t").body;
  // Anchored on the slash: an unanchored "react@" also matches
  // lucide-react@0.454.0, which is a different package entirely.
  const versions = [...html.matchAll(/\/react(?:-dom)?@([\d.]+)/g)].map((m) => m[1]);
  assert.ok(versions.length > 1, "expected several react URLs");
  assert.equal(new Set(versions).size, 1, `mixed react versions: ${versions.join(", ")}`);
  // And lucide keeps its own version while sharing our React.
  assert.match(html, /lucide-react@0\.454\.0[^"]*deps=react@18\.3\.1/);
});

// ── The prompt ──────────────────────────────────────────────

test("the prompt lists the packages, because a rule alone does not stop invention", () => {
  const text = catalogueRules();
  for (const p of CATALOGUE) assert.ok(text.includes(p.name), `${p.name} missing from the prompt`);
  assert.match(text, /this list is exhaustive/i);
  assert.match(text, /Prefer no dependency/i);
});

test("the catalogue reaches the design rules", () => {
  assert.match(DESIGN_RULES, /AVAILABLE PACKAGES/);
  assert.match(DESIGN_RULES, /lucide-react@0\.454\.0/);
});

test("icons now point at the package instead of hand-drawn SVG", () => {
  // There is a real icon set available, so asking the model to draw
  // paths by hand is asking for worse output at higher cost.
  assert.match(DESIGN_RULES, /import \{ Truck, Receipt, Users \} from 'lucide-react'/);
  assert.match(DESIGN_RULES, /Do not hand-write SVG paths when an icon exists/);
  // But the emoji ban has to survive the rewrite.
  assert.match(DESIGN_RULES, /Never emoji/i);
});

test("inCatalogue is the single source of truth", () => {
  assert.ok(inCatalogue("recharts"));
  assert.ok(!inCatalogue("axios"));
  assert.ok(!inCatalogue(""));
});
