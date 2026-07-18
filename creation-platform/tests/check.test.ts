import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProject } from "../src/lib/check.js";

test("valid python passes the check", () => {
  const result = checkProject("python", [
    { path: "app.py", content: "print('hello')\n" },
  ]);
  // ok either because it compiled, or because no python is installed
  assert.equal(result.ok, true);
});

test("broken python fails the check with an error report", (t) => {
  const result = checkProject("python", [
    { path: "app.py", content: "def broken(:\n    pass\n" },
  ]);
  if (!result.checked) {
    t.skip("no python interpreter on this machine");
    return;
  }
  assert.equal(result.ok, false);
  assert.match(result.errors, /app\.py/);
});

test("non-python targets are skipped", () => {
  const result = checkProject("web", []);
  assert.equal(result.ok, true);
  assert.equal(result.checked, false);
});
