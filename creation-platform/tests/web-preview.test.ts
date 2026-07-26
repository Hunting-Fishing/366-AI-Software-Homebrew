import { test } from "node:test";
import assert from "node:assert/strict";
import { WebPreview } from "../src/services/webPreview.js";
import type { ProjectFile } from "../src/lib/files.js";

// React previews used to mean `npm install` + a Vite dev server inside
// the platform's container. On a 512MB instance that is 300-500MB on top
// of the running server, so the OOM killer took the process down and
// Render answered 502. It also cost ~60s every time.
//
// Now the project is served from memory: TypeScript transpiles the JSX,
// an import map resolves the packages in the browser. No install, no
// subprocess, nothing to run out of memory.

const PROJECT: ProjectFile[] = [
  { path: "package.json", content: '{"name":"r"}' },
  {
    path: "index.html",
    content: '<!DOCTYPE html><html><head><title>My App</title></head><body><div id="root"></div></body></html>',
  },
  {
    path: "src/main.jsx",
    content:
      "import { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\ncreateRoot(document.getElementById('root')).render(<App />);\n",
  },
  {
    path: "src/App.jsx",
    content:
      "import { useState } from 'react';\nimport Card from './components/Card.jsx';\nexport default function App(){ const [n]=useState(0); return <div><Card v={n}/></div>; }\n",
  },
  { path: "src/components/Card.jsx", content: "export default ({v}) => <b>{v}</b>;\n" },
  { path: "src/styles.css", content: ".app{padding:1rem}\n" },
];

function loaded() {
  const wp = new WebPreview();
  wp.load(PROJECT);
  return wp;
}

test("nothing is served before a project is loaded", () => {
  const wp = new WebPreview();
  assert.equal(wp.loaded, false);
  assert.equal(wp.serve("/", "/live").status, 503);
});

test("JSX is transpiled to plain JS", () => {
  const out = loaded().serve("/src/App.jsx", "/live");
  assert.equal(out.status, 200);
  assert.doesNotMatch(out.body, /<div>/, "raw JSX would be a syntax error in the browser");
  assert.match(out.body, /jsx/i);
});

test("the automatic JSX runtime is used, so files need not import React", () => {
  const out = loaded().serve("/src/components/Card.jsx", "/live");
  assert.match(out.body, /from "react\/jsx-runtime"/,
    "without this, a component that never imports React throws at runtime");
});

test("extensionless relative imports get a real extension", () => {
  // Browsers do not guess "./App" -> "./App.jsx" the way a bundler does.
  const out = loaded().serve("/src/main.jsx", "/live");
  assert.match(out.body, /from '\.\/App\.jsx'/);
});

test("CSS imports are stripped — browsers cannot import CSS as a module", () => {
  const out = loaded().serve("/src/main.jsx", "/live");
  assert.doesNotMatch(out.body, /styles\.css/,
    "left in place this throws 'Expected a JavaScript module'");
});

test("stylesheets are injected into the html instead", () => {
  const html = loaded().serve("/", "/live");
  assert.match(html.body, /<link rel="stylesheet" href="\/live\/src\/styles\.css">/);
});

test("the html carries an import map so react resolves without node_modules", () => {
  const html = loaded().serve("/", "/live");
  assert.match(html.body, /<script type="importmap">/);
  assert.match(html.body, /"react-dom\/client"|"react-dom\/"/,
    "react-dom/client is what main.jsx imports");
});

test("react and react-dom pin to the same version", () => {
  // Two React copies is the classic "invalid hook call" crash.
  const html = loaded().serve("/", "/live");
  const versions = [...html.body.matchAll(/react(?:-dom)?@([\d.]+)/g)].map((m) => m[1]);
  assert.ok(versions.length > 1);
  assert.equal(new Set(versions).size, 1, `mixed react versions: ${versions.join(", ")}`);
});

test("the original page title is kept", () => {
  assert.match(loaded().serve("/", "/live").body, /<title>My App<\/title>/);
});

test("css is served with the right content type", () => {
  const out = loaded().serve("/src/styles.css", "/live");
  assert.equal(out.status, 200);
  assert.match(out.contentType, /text\/css/);
  assert.match(out.body, /padding/);
});

test("nested paths resolve", () => {
  assert.equal(loaded().serve("/src/components/Card.jsx", "/live").status, 200);
});

test("a missing file is a 404, not a crash", () => {
  assert.equal(loaded().serve("/does/not/exist.js", "/live").status, 404);
});

test("query strings are ignored when resolving a file", () => {
  // The browser cache-busts with ?t=...
  assert.equal(loaded().serve("/src/App.jsx?t=123", "/live").status, 200);
});

test("a project with no entry module says so instead of rendering blank", () => {
  const wp = new WebPreview();
  wp.load([{ path: "index.html", content: "<html></html>" }]);
  const out = wp.serve("/", "/live");
  assert.equal(out.status, 500);
  assert.match(out.body, /entry module/i);
});

test("clear() unloads the project", () => {
  const wp = loaded();
  wp.clear();
  assert.equal(wp.loaded, false);
});

test("loading a second project replaces the first", () => {
  const wp = loaded();
  wp.load([
    { path: "index.html", content: "<html><title>Second</title></html>" },
    { path: "src/main.jsx", content: "console.log(1);\n" },
  ]);
  assert.equal(wp.serve("/src/App.jsx", "/live").status, 404, "the old project must be gone");
  assert.match(wp.serve("/", "/live").body, /Second/);
});
