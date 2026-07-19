import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHtml, extractJsonArray } from "../src/lib/extract.js";

const DOC = "<!DOCTYPE html><html><body>hi</body></html>";

test("returns clean HTML untouched", () => {
  assert.equal(extractHtml(DOC), DOC);
});

test("strips markdown code fences", () => {
  assert.equal(extractHtml("```html\n" + DOC + "\n```"), DOC);
  assert.equal(extractHtml("```\n" + DOC + "\n```"), DOC);
});

test("drops chatter before the doctype", () => {
  assert.equal(extractHtml("Sure! Here is your app:\n" + DOC), DOC);
});

test("trims surrounding whitespace", () => {
  assert.equal(extractHtml("\n\n  " + DOC + "  \n"), DOC);
});

test("extractJsonArray parses a clean array", () => {
  const out = extractJsonArray('[{"title":"a","prompt":"b"}]');
  assert.equal(out.length, 1);
});

test("extractJsonArray survives fences and chatter", () => {
  const out = extractJsonArray('Here you go:\n```json\n[{"title":"x"},{"title":"y"}]\n```\nEnjoy!');
  assert.equal(out.length, 2);
});

test("extractJsonArray rejects replies with no array", () => {
  assert.throws(() => extractJsonArray("sorry, no can do"), /No JSON array/);
});
