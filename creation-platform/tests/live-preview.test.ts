import { test } from "node:test";
import assert from "node:assert/strict";
import { upstreamPath } from "../src/routes/live.js";
import { LIVE_PATH, previewRunner } from "../src/services/runner.js";

// The bug these guard against: the preview used to hand the browser
// http://127.0.0.1:PORT/. That resolves to the machine the BROWSER is
// on. Fine on a laptop, useless on a server — every deployed user got
// connection refused, because 127.0.0.1 was their own phone.
//
// The preview is now served through this server's own origin at /live.
//
// A per-run token was later added as the first path segment
// (/live/<token>/…). It is the credential for the preview, because the
// frame is sandboxed to an opaque origin and so sends no cookies —
// see tests/preview-origin.test.ts. Everything below therefore
// addresses the preview through that prefix, exactly as the browser
// does.

const T = "a".repeat(32);
const P = `/live/${T}`;

test("the preview URL is same-origin, never 127.0.0.1", () => {
  assert.equal(LIVE_PATH, "/live");
  assert.doesNotMatch(LIVE_PATH, /127\.0\.0\.1|localhost|https?:/,
    "an absolute address here only works when the browser is on the same machine");
});

test("the /live prefix and the token are stripped before forwarding upstream", () => {
  // The preview process knows about neither.
  assert.equal(upstreamPath(`${P}/`), "/");
  assert.equal(upstreamPath(P), "/", "a bare prefix must not forward an empty path");
  assert.equal(upstreamPath(`${P}/index.html`), "/index.html");
  assert.equal(upstreamPath(`${P}/src/App.jsx`), "/src/App.jsx");
  assert.equal(upstreamPath(`${P}/@vite/client`), "/@vite/client");
});

test("query strings survive the rewrite", () => {
  assert.equal(upstreamPath(`${P}/api/items?page=2&q=x`), "/api/items?page=2&q=x");
  assert.equal(upstreamPath(`${P}/src/App.jsx?t=1712345`), "/src/App.jsx?t=1712345",
    "Vite cache-busts modules with a query — dropping it breaks hot reload");
});

test("a path that merely starts with the same letters is not mangled", () => {
  // /livestream would become /stream if the prefix were stripped naively
  // by string replacement rather than by length.
  assert.equal(upstreamPath(`${P}/livestream`), "/livestream");
});

test("no preview running reports no port rather than throwing", () => {
  previewRunner.stop();
  assert.equal(previewRunner.port(), null);
});
