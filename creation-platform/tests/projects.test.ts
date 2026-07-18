import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonProjectStore } from "../src/services/projects.js";

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "projects-test-"));
  return new JsonProjectStore(dir);
}

test("save then get returns the same project", () => {
  const store = tempStore();
  const saved = store.save("My App", "a todo app", "<!DOCTYPE html><p>x</p>");
  const loaded = store.get(saved.id);
  assert.ok(loaded);
  assert.equal(loaded.name, "My App");
  assert.equal(loaded.code, "<!DOCTYPE html><p>x</p>");
});

test("list returns summaries, newest first", () => {
  const store = tempStore();
  store.save("First", "", "<p>1</p>");
  store.save("Second", "", "<p>2</p>");
  const list = store.list();
  assert.equal(list.length, 2);
  assert.ok(list[0] && list[1]);
});

test("get with unknown id returns null", () => {
  const store = tempStore();
  assert.equal(store.get("nope"), null);
});

test("ids are safe slugs", () => {
  const store = tempStore();
  const saved = store.save("Crazy Name!! ###", "", "<p>x</p>");
  assert.match(saved.id, /^crazy-name-+\d+$/);
});
