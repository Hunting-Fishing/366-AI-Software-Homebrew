import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProject } from "../src/lib/check.js";
import type { ProjectFile } from "../src/lib/files.js";

// The auto-fix loop spends a second model call every time these checks
// report a problem. So the bar for a FAILURE is high, and most of these
// tests exist to prove valid projects are left alone.

const PKG = {
  path: "package.json",
  content: JSON.stringify(
    { name: "app", type: "module", scripts: { dev: "vite", build: "vite build" } },
    null,
    2
  ),
};
const HTML = {
  path: "index.html",
  content: `<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
};
const MAIN = {
  path: "src/main.jsx",
  content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(<App />);
`,
};
const APP = {
  path: "src/App.jsx",
  content: `import { useState } from "react";
import Header from "./components/Header.jsx";
export default function App() {
  const [n, setN] = useState(0);
  return (
    <div className="app">
      <Header title="Counter" />
      <button onClick={() => setN(n + 1)}>Clicked {n} times</button>
    </div>
  );
}
`,
};
const HEADER = {
  path: "src/components/Header.jsx",
  content: `export default function Header({ title }) {
  return <h1>{title}</h1>;
}
`,
};
const CSS = { path: "src/styles.css", content: ".app { padding: 1rem; }\n" };

const VALID: ProjectFile[] = [PKG, HTML, MAIN, APP, HEADER, CSS];

// ── the important ones: no false positives ───────────────────

test("a well-formed React project passes", () => {
  const r = checkProject("react", VALID);
  assert.equal(r.ok, true, r.errors);
  assert.equal(r.checked, true);
});

test("extensionless imports resolve", () => {
  const files = VALID.map((f) =>
    f.path === "src/App.jsx"
      ? { ...f, content: f.content.replace('"./components/Header.jsx"', '"./components/Header"') }
      : f
  );
  assert.equal(checkProject("react", files).ok, true);
});

test("index.jsx barrel imports resolve", () => {
  const files: ProjectFile[] = [
    PKG, HTML, MAIN,
    { ...APP, content: APP.content.replace('"./components/Header.jsx"', '"./components"') },
    { path: "src/components/index.jsx", content: "export { default } from './Header.jsx';\n" },
    HEADER, CSS,
  ];
  assert.equal(checkProject("react", files).ok, true);
});

test("bare package imports are never flagged as missing files", () => {
  const r = checkProject("react", VALID);
  assert.doesNotMatch(r.errors, /react/, "react and react-dom/client are npm packages, not files");
});

test("src/index.jsx is accepted as an entry point too", () => {
  const files = VALID.map((f) => (f.path === "src/main.jsx" ? { ...f, path: "src/index.jsx" } : f));
  const r = checkProject("react", files);
  assert.doesNotMatch(r.errors, /entry module/);
});

test("an empty file list is not reported as broken", () => {
  const r = checkProject("react", []);
  assert.equal(r.ok, true);
  assert.equal(r.checked, false, "nothing to check is not the same as checked and fine");
});

// ── real failures ────────────────────────────────────────────

test("unclosed JSX is caught", () => {
  const files = VALID.map((f) =>
    f.path === "src/App.jsx" ? { ...f, content: "export default function App(){ return <div><span>hi</div>; }" } : f
  );
  const r = checkProject("react", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /src\/App\.jsx/);
  assert.match(r.errors, /span/);
});

test("a truncated file is caught", () => {
  const files = VALID.map((f) =>
    f.path === "src/App.jsx" ? { ...f, content: APP.content.slice(0, 180) } : f
  );
  assert.equal(checkProject("react", files).ok, false);
});

test("importing a component that was never written is caught", () => {
  // Header.jsx removed — exactly what models do when they forget a file.
  const files = VALID.filter((f) => f.path !== "src/components/Header.jsx");
  const r = checkProject("react", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /do not exist/);
  assert.match(r.errors, /Header/);
});

test("a missing CSS import is caught", () => {
  const files = VALID.filter((f) => f.path !== "src/styles.css");
  const r = checkProject("react", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /styles\.css/);
});

test("malformed package.json is caught", () => {
  const files = VALID.map((f) =>
    f.path === "package.json" ? { ...f, content: '{ "name": "app", }' } : f
  );
  const r = checkProject("react", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /package\.json/);
});

test("a missing index.html is caught", () => {
  const r = checkProject("react", VALID.filter((f) => f.path !== "index.html"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /index\.html/);
});

test("errors name the file and line so the model can act on them", () => {
  const files = VALID.map((f) =>
    f.path === "src/App.jsx"
      ? { ...f, content: "export default function App() {\n  return <p>{x</p>;\n}\n" }
      : f
  );
  const r = checkProject("react", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /--- src\/App\.jsx ---/);
  assert.match(r.errors, /line \d+/);
});
