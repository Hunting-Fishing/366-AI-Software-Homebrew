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

test("the preview URL is same-origin, never 127.0.0.1", () => {
  assert.equal(LIVE_PATH, "/live");
  assert.doesNotMatch(LIVE_PATH, /127\.0\.0\.1|localhost|https?:/,
    "an absolute address here only works when the browser is on the same machine");
});

test("the /live prefix is stripped before forwarding upstream", () => {
  assert.equal(upstreamPath("/live/"), "/");
  assert.equal(upstreamPath("/live"), "/", "bare /live must not forward an empty path");
  assert.equal(upstreamPath("/live/index.html"), "/index.html");
  assert.equal(upstreamPath("/live/src/App.jsx"), "/src/App.jsx");
  assert.equal(upstreamPath("/live/@vite/client"), "/@vite/client");
});

test("query strings survive the rewrite", () => {
  assert.equal(upstreamPath("/live/api/items?page=2&q=x"), "/api/items?page=2&q=x");
  assert.equal(upstreamPath("/live/src/App.jsx?t=1712345"), "/src/App.jsx?t=1712345",
    "Vite cache-busts modules with a query — dropping it breaks hot reload");
});

test("a path that merely starts with the same letters is not mangled", () => {
  // /livestream would become /stream if the prefix were stripped naively
  // by string replacement rather than by length.
  assert.equal(upstreamPath("/live/livestream"), "/livestream");
});

test("no preview running reports no port rather than throwing", () => {
  previewRunner.stop();
  assert.equal(previewRunner.port(), null);
});
