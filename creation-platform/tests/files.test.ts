import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFiles, serializeFiles } from "../src/lib/files.js";

const SAMPLE = `===FILE: pubspec.yaml===
name: my_app
===ENDFILE===
===FILE: lib/main.dart===
void main() {}
===ENDFILE===`;

test("parses multiple files with paths", () => {
  const files = parseFiles(SAMPLE, "lib/main.dart");
  assert.equal(files.length, 2);
  assert.equal(files[0]?.path, "pubspec.yaml");
  assert.equal(files[1]?.path, "lib/main.dart");
  assert.match(files[1]?.content ?? "", /void main/);
});

test("falls back to single file when no markers", () => {
  const files = parseFiles("print('hello')", "app.py");
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, "app.py");
});

test("strips an outer markdown fence", () => {
  const files = parseFiles("```\n" + SAMPLE + "\n```", "lib/main.dart");
  assert.equal(files.length, 2);
});

test("rejects path traversal", () => {
  const evil = `===FILE: ../../etc/passwd===\nx\n===ENDFILE===\n===FILE: ok.py===\ny\n===ENDFILE===`;
  const files = parseFiles(evil, "app.py");
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, "ok.py");
});

test("serialize → parse round-trips", () => {
  const files = parseFiles(SAMPLE, "lib/main.dart");
  const again = parseFiles(serializeFiles(files), "lib/main.dart");
  assert.deepEqual(again.map((f) => f.path), files.map((f) => f.path));
});
