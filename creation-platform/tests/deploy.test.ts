import { test } from "node:test";
import assert from "node:assert/strict";
import { sha1, slugify, deploySite } from "../src/services/deploy.js";

test("sha1 produces known digests", () => {
  assert.equal(sha1("hello"), "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
});

test("slugify makes url-safe names with a random suffix", () => {
  const slug = slugify("My Cool App!!");
  assert.match(slug, /^my-cool-app-[a-z0-9]{5}$/);
});

test("publish without a token gives setup instructions", async (t) => {
  if (process.env.NETLIFY_TOKEN) {
    t.skip("token present in this environment");
    return;
  }
  await assert.rejects(
    () => deploySite("x", [{ path: "index.html", content: "<p>hi</p>" }]),
    /NETLIFY_TOKEN/
  );
});
