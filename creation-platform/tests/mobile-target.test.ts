import { test } from "node:test";
import assert from "node:assert/strict";
import { getTarget, listTargets, runsWithVite } from "../src/targets.js";
import { checkProject } from "../src/lib/check.js";
import { openhandsLane } from "../src/lanes/openhands.js";
import type { ProjectFile } from "../src/lib/files.js";

// The mobile target is a React project plus a Capacitor wrapper. The
// point of it is that Capacitor packaging happens on the developer's
// machine, so the server gains no new dependency — no Flutter SDK, no
// Android SDK, nothing. These tests pin that down.

const CAP = {
  path: "capacitor.config.json",
  content: JSON.stringify({ appId: "com.example.myapp", appName: "My App", webDir: "dist" }, null, 2),
};
const VITE = {
  path: "vite.config.js",
  content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], base: "./" });\n`,
};
const PKG = {
  path: "package.json",
  content: JSON.stringify({
    name: "my-app",
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1", "@capacitor/core": "^6.1.2" },
  }),
};
const HTML = { path: "index.html", content: `<!DOCTYPE html><div id="root"></div><script type="module" src="/src/main.jsx"></script>` };
const MAIN = { path: "src/main.jsx", content: `import App from "./App.jsx";\nimport "./styles.css";\n` };
const APP = { path: "src/App.jsx", content: `export default function App() { return <div>hi</div>; }\n` };
const CSS = { path: "src/styles.css", content: "body { margin: 0; }\n" };

const VALID: ProjectFile[] = [PKG, HTML, VITE, CAP, MAIN, APP, CSS];

// ── registration ─────────────────────────────────────────────

test("the mobile target is registered and offered to users", () => {
  const t = getTarget("mobile");
  assert.equal(t.id, "mobile");
  assert.equal(t.mode, "multi-file");
  assert.ok(listTargets().some((x) => x.id === "mobile"));
});

test("mobile runs on the Vite pipeline, so it needs no new server tooling", () => {
  assert.equal(runsWithVite("mobile"), true);
  assert.equal(runsWithVite("react"), true);
  assert.equal(runsWithVite("flutter"), false, "flutter would need a 2GB SDK — deliberately not wired");
  assert.equal(runsWithVite("python"), false);
});

test("the prompt tells the model to build for a phone, not a shrunk desktop", () => {
  const p = getTarget("mobile").systemPrompt;
  assert.match(p, /capacitor\.config\.json/);
  assert.match(p, /safe-area-inset/);
  assert.match(p, /44/, "touch target size");
  assert.match(p, /base: "\.\/"/);
});

test("run instructions are explicit that native builds happen off this server", () => {
  assert.match(getTarget("mobile").runInstructions, /your own machine/i);
});

// ── checks ───────────────────────────────────────────────────

test("a well-formed mobile project passes", () => {
  const r = checkProject("mobile", VALID);
  assert.equal(r.ok, true, r.errors);
  assert.equal(r.checked, true);
});

test("it still inherits every React check", () => {
  const r = checkProject("mobile", VALID.filter((f) => f.path !== "src/styles.css"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /styles\.css/);
});

test("a missing capacitor config is caught", () => {
  const r = checkProject("mobile", VALID.filter((f) => f.path !== "capacitor.config.json"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /capacitor\.config\.json/);
});

test("a bad appId is caught", () => {
  const files = VALID.map((f) =>
    f.path === "capacitor.config.json"
      ? { ...f, content: JSON.stringify({ appId: "myapp", appName: "My App", webDir: "dist" }) }
      : f
  );
  const r = checkProject("mobile", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /reverse-domain/);
});

test("a webDir that does not match Vite's output is caught", () => {
  const files = VALID.map((f) =>
    f.path === "capacitor.config.json"
      ? { ...f, content: JSON.stringify({ appId: "com.example.a", appName: "A", webDir: "www" }) }
      : f
  );
  const r = checkProject("mobile", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /webDir/);
});

test('a missing base: "./" is caught — the blank-screen-on-device bug', () => {
  const files = VALID.map((f) =>
    f.path === "vite.config.js"
      ? { ...f, content: `export default { plugins: [] };\n` }
      : f
  );
  const r = checkProject("mobile", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /base/);
});

test("the plain react target is not subjected to Capacitor rules", () => {
  const reactOnly = VALID.filter((f) => f.path !== "capacitor.config.json");
  const r = checkProject("react", reactOnly);
  assert.equal(r.ok, true, r.errors);
});

// ── routing ──────────────────────────────────────────────────

test("mobile edits are eligible for the OpenHands lane", () => {
  const saved = { u: process.env.OPENHANDS_SERVER_URL, k: process.env.ANTHROPIC_API_KEY };
  process.env.OPENHANDS_SERVER_URL = "http://127.0.0.1:8000";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  try {
    assert.equal(openhandsLane.supports("mobile", "edit"), true);
    assert.equal(openhandsLane.supports("mobile", "create"), false);
  } finally {
    if (saved.u === undefined) delete process.env.OPENHANDS_SERVER_URL;
    else process.env.OPENHANDS_SERVER_URL = saved.u;
    if (saved.k === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.k;
  }
});
