import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { splitLive, upstreamPath } from "../src/routes/live.js";
import { previewRunner, LIVE_PATH } from "../src/services/runner.js";

// THE TRADE-OFF THIS RESOLVES
//
// The preview iframe must be sandboxed WITHOUT allow-same-origin: it
// runs freshly generated code, and /live is served from the platform's
// own origin, so same-origin access would let that code read
// parent.document, the session cookie, and call the API as the
// signed-in user.
//
// But an opaque origin sends no cookies. The moment the sandbox was
// tightened, every module the app imported came back 401 and the
// browser blocked it as a CORS failure — the preview stopped working
// entirely. Two errors, one cause.
//
// The resolution is a per-run token in the path: /live/<token>/…
// The token is the credential, so the route can be public and
// CORS-open while the sandbox stays shut.

test("the preview URL carries a token", () => {
  previewRunner.stop();
  const s = previewRunner.begin([{ path: "src/main.jsx", content: "x\n" }], true);
  assert.equal(s.state, "ready");
  assert.match(s.url!, /^\/live\/[0-9a-f]{32}\/$/);
  previewRunner.stop();
});

test("the token is long enough not to be guessed", () => {
  previewRunner.begin([{ path: "src/main.jsx", content: "x\n" }], true);
  const token = previewRunner.base().slice(LIVE_PATH.length + 1);
  assert.ok(token.length >= 32, `token is only ${token.length} chars`);
  previewRunner.stop();
});

test("a new build rotates the token", () => {
  // Otherwise a link shared once keeps working against whatever the
  // platform is previewing later.
  previewRunner.begin([{ path: "src/main.jsx", content: "a\n" }], true);
  const first = previewRunner.base();
  previewRunner.begin([{ path: "src/main.jsx", content: "b\n" }], true);
  assert.notEqual(previewRunner.base(), first);
  assert.ok(!previewRunner.accepts(first.slice(LIVE_PATH.length + 1)),
    "the old token must stop working");
  previewRunner.stop();
});

test("the current token is accepted and anything else is not", () => {
  previewRunner.begin([{ path: "src/main.jsx", content: "x\n" }], true);
  const token = previewRunner.base().slice(LIVE_PATH.length + 1);
  assert.ok(previewRunner.accepts(token));
  assert.ok(!previewRunner.accepts(""));
  assert.ok(!previewRunner.accepts("0".repeat(32)));
  assert.ok(!previewRunner.accepts(token.slice(0, -1)));
  previewRunner.stop();
});

// ── Path splitting ──────────────────────────────────────────

test("the token is separated from the path it guards", () => {
  const t = "a".repeat(32);
  assert.deepEqual(splitLive(`/live/${t}/src/App.jsx`), { token: t, path: "/src/App.jsx" });
  assert.deepEqual(splitLive(`/live/${t}/`), { token: t, path: "/" });
  assert.deepEqual(splitLive(`/live/${t}`), { token: t, path: "/" });
});

test("a cache-buster is not mistaken for part of the token", () => {
  // The client appends ?t=<now> on every reload. Reading that as token
  // text would make every reload a 404.
  const t = "b".repeat(32);
  assert.deepEqual(splitLive(`/live/${t}?t=1785058285285`), { token: t, path: "/" });
});

test("upstreamPath strips the token as well as the prefix", () => {
  // The preview process knows nothing about either.
  const t = "c".repeat(32);
  assert.equal(upstreamPath(`/live/${t}/index.html`), "/index.html");
  assert.equal(upstreamPath(`/live/${t}/`), "/");
});

// ── The route and the middleware ────────────────────────────

const LIVE_SRC = fs.readFileSync(new URL("../src/routes/live.ts", import.meta.url), "utf8");
const AUTH_SRC = fs.readFileSync(new URL("../src/middleware/auth.ts", import.meta.url), "utf8");
const PAGE = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("the preview route answers CORS, because the frame is cross-origin", () => {
  assert.match(LIVE_SRC, /access-control-allow-origin/);
  assert.match(LIVE_SRC, /cross-origin-resource-policy/);
});

test("a bad token is a 404, not a hint that something is there", () => {
  assert.match(LIVE_SRC, /if \(!previewRunner\.accepts\(token\)\)/);
  assert.match(LIVE_SRC, /404/);
});

test("the WebSocket upgrade checks the token too", () => {
  // Upgrades bypass Express, so they bypass the route's check. Without
  // this it is the one way into a preview that never proves it may be.
  const fn = LIVE_SRC.match(/export function attachLiveWebSocketProxy[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(fn, /previewRunner\.accepts\(splitLive\(req\.url\)\.token\)/);
});

test("auth exempts the preview, and only the preview", () => {
  assert.match(AUTH_SRC, /PREVIEW_PREFIX = "\/live\/"/);
  assert.match(AUTH_SRC, /req\.path\.startsWith\(PREVIEW_PREFIX\)/);
  // "/live" without the trailing slash must not exempt "/livewire" or
  // anything else that merely starts the same way.
  assert.doesNotMatch(AUTH_SRC, /startsWith\("\/live"\)/);
});

test("the sandbox stays closed", () => {
  const grants = [...PAGE.matchAll(/sandbox["'\s,]+["']([^"']*allow-scripts[^"']*)["']/g)]
    .map((m) => m[1]!);
  assert.ok(grants.length > 0);
  for (const g of grants) assert.doesNotMatch(g, /allow-same-origin/);
});

test("the client never assembles a preview URL itself", () => {
  // Only the server knows the token. A hardcoded "/live/" is a 404 —
  // which is exactly what the pop-out button became.
  assert.doesNotMatch(PAGE, /["']\/live\/\?/);
  assert.match(PAGE, /liveUrl = data\.url/);
  assert.match(PAGE, /window\.open\(liveUrl/);
});
