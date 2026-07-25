import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProject } from "../src/lib/check.js";
import type { ProjectFile } from "../src/lib/files.js";

// Flutter and Godot get structural checks rather than a real compiler,
// because neither toolchain is normally installed on the box running
// the platform. Structure-only means these must be especially careful
// not to invent problems.

// ── Flutter ──────────────────────────────────────────────────

const FLUTTER: ProjectFile[] = [
  { path: "pubspec.yaml", content: "name: app\nenvironment:\n  sdk: '>=3.0.0 <4.0.0'\n" },
  {
    path: "lib/main.dart",
    content: `import 'package:flutter/material.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(home: Scaffold(body: Center(child: Text('hi'))));
  }
}
`,
  },
];

test("a well-formed Flutter project is not flagged", () => {
  const r = checkProject("flutter", FLUTTER);
  assert.equal(r.ok, true, r.errors);
});

test("missing pubspec.yaml is caught", () => {
  const r = checkProject("flutter", FLUTTER.filter((f) => f.path !== "pubspec.yaml"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /pubspec\.yaml/);
});

test("missing lib/main.dart is caught", () => {
  const r = checkProject("flutter", FLUTTER.filter((f) => f.path !== "lib/main.dart"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /main\.dart/);
});

test("a dart file cut off mid-write is caught", () => {
  const files = FLUTTER.map((f) =>
    f.path === "lib/main.dart" ? { ...f, content: f.content.slice(0, 200) } : f
  );
  const r = checkProject("flutter", files);
  assert.equal(r.ok, false);
  assert.match(r.errors, /truncated/);
});

test("trailing whitespace after the final brace is not truncation", () => {
  const files = FLUTTER.map((f) =>
    f.path === "lib/main.dart" ? { ...f, content: f.content + "\n\n  \n" } : f
  );
  assert.equal(checkProject("flutter", files).ok, true);
});

// ── Godot ────────────────────────────────────────────────────

const GODOT: ProjectFile[] = [
  { path: "project.godot", content: 'config_version=5\n[application]\nrun/main_scene="res://main.tscn"\n' },
  {
    path: "main.tscn",
    content: `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/player.gd" id="1"]

[node name="Main" type="Node2D"]
script = ExtResource("1")
`,
  },
  { path: "scripts/player.gd", content: "extends Node2D\n\nfunc _ready() -> void:\n\tpass\n" },
];

test("a well-formed Godot project is not flagged", () => {
  const r = checkProject("godot", GODOT);
  assert.equal(r.ok, true, r.errors);
});

test("missing project.godot is caught", () => {
  const r = checkProject("godot", GODOT.filter((f) => f.path !== "project.godot"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /project\.godot/);
});

test("a project with no scene is caught", () => {
  const r = checkProject("godot", GODOT.filter((f) => !f.path.endsWith(".tscn")));
  assert.equal(r.ok, false);
  assert.match(r.errors, /scene/i);
});

test("a scene pointing at a script that was never written is caught", () => {
  const r = checkProject("godot", GODOT.filter((f) => f.path !== "scripts/player.gd"));
  assert.equal(r.ok, false);
  assert.match(r.errors, /player\.gd/);
});

// ── targets with no checker ──────────────────────────────────

test("book and video report checked:false rather than a false all-clear", () => {
  for (const target of ["book", "video", "web"]) {
    const r = checkProject(target, [{ path: "a.md", content: "x" }]);
    assert.equal(r.ok, true, target);
    assert.equal(r.checked, false, `${target} has no checker — it must not claim it verified anything`);
  }
});

test("an unknown target never blocks generation", () => {
  const r = checkProject("some-future-target", [{ path: "a", content: "b" }]);
  assert.equal(r.ok, true);
  assert.equal(r.checked, false);
});
