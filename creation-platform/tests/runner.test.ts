import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareForRun } from "../src/services/runner.js";

const APP = {
  path: "app.py",
  content: 'from flask import Flask\napp = Flask(__name__)\nif __name__ == "__main__":\n    app.run(debug=True)\n',
};

test("injects host and port into app.run", () => {
  const [out] = prepareForRun([APP], 5123);
  assert.match(out!.content, /app\.run\(host="127\.0\.0\.1", port=5123,/);
});

test("disables flask debug mode (reloader breaks cleanup)", () => {
  const [out] = prepareForRun([APP], 5123);
  assert.doesNotMatch(out!.content, /debug=True/);
});

test("leaves non-python files untouched", () => {
  const files = [{ path: "requirements.txt", content: "flask\n" }];
  const out = prepareForRun(files, 5123);
  assert.equal(out[0]?.content, "flask\n");
});
