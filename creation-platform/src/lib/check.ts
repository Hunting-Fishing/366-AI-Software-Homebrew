// Auto-check: validate generated code before showing it to the user.
// If errors are found, the generate route feeds them back to the model
// for an automatic fix (the "error-fix loop" — Bolt's core trick).
//
// One function per target. The rule for all of them: NEVER report a
// problem you are not sure about. A false positive sends a perfectly
// good project into a pointless second model call, which costs money
// and can make the result worse. Silence is the safe default — that is
// what `checked: false` means.
//
// Coverage:
//   python   real     py_compile, if an interpreter is installed
//   react    real     JSX/TS parse + import resolution + entry points
//   flutter  partial  dart analyze if installed, else structure only
//   godot    partial  structure + scene→script reference resolution
//   web      n/a      single-file HTML never reaches here

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import type { ProjectFile } from "./files.js";
import { CATALOGUE, inCatalogue } from "../packages.js";

export interface CheckResult {
  ok: boolean;
  /** Human/model-readable error report (empty when ok). */
  errors: string;
  /** False when no checker is available for this target on this machine. */
  checked: boolean;
}

const OK: CheckResult = { ok: true, errors: "", checked: false };
const PASSED: CheckResult = { ok: true, errors: "", checked: true };

function report(problems: string[]): CheckResult {
  return problems.length === 0
    ? PASSED
    : { ok: false, errors: problems.join("\n\n"), checked: true };
}

// ─────────────────────────────────────────────────────────────
// Python — unchanged
// ─────────────────────────────────────────────────────────────

let cachedPython: string | null | undefined;

function pythonCmd(): string | null {
  if (cachedPython !== undefined) return cachedPython;
  for (const cmd of ["python3", "python"]) {
    try {
      const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 5000 });
      if (r.status === 0) {
        cachedPython = cmd;
        return cmd;
      }
    } catch {
      /* not installed under this name */
    }
  }
  cachedPython = null;
  return null;
}

function checkPython(files: ProjectFile[]): CheckResult {
  const py = pythonCmd();
  if (!py) return OK; // no interpreter → skip, don't block the user

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-check-"));
  try {
    for (const f of files) {
      const p = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.content);
    }
    const problems: string[] = [];
    for (const f of files.filter((f) => f.path.endsWith(".py"))) {
      const r = spawnSync(py, ["-m", "py_compile", path.join(dir, f.path)], {
        encoding: "utf8",
        timeout: 10000,
      });
      if (r.status !== 0) {
        // Strip temp-dir noise so the model sees clean paths.
        const msg = (r.stderr || "unknown error").split(dir + path.sep).join("");
        problems.push(`--- ${f.path} ---\n${msg.trim()}`);
      }
    }
    return report(problems);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────
// React — the daily-driver target, so this one is real
//
// Deliberately does NOT run `npm install` + `vite build`. That is the
// only way to be certain a project compiles, but it costs 60+ seconds
// and network access on every generation. These checks take
// milliseconds, need nothing installed, and catch the failures models
// actually make: unclosed JSX, truncated files, and importing a
// component that was never written.
// ─────────────────────────────────────────────────────────────

const SCRIPT_EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs"];

function scriptKind(p: string): ts.ScriptKind {
  if (p.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (p.endsWith(".ts")) return ts.ScriptKind.TS;
  // Treat .js and .jsx alike. React projects routinely put JSX in .js,
  // and JSX parsing is a superset, so this never rejects valid JS.
  return ts.ScriptKind.JSX;
}

function sourceFile(file: ProjectFile): ts.SourceFile {
  return ts.createSourceFile(
    file.path,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file.path)
  );
}

/** Syntax errors in one file, as readable strings. */
function parseProblems(file: ProjectFile): string[] {
  const sf = sourceFile(file);
  const diags =
    (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];

  // Cap at 5 — after the first few, later diagnostics are usually
  // cascade noise from the same real mistake.
  return diags.slice(0, 5).map((d) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
    if (d.start === undefined) return msg;
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
    return `line ${line + 1}, col ${character + 1}: ${msg}`;
  });
}

/** Every relative import/export specifier in a source file. */
function relativeImports(file: ProjectFile): string[] {
  const sf = sourceFile(file);
  const found: string[] = [];
  for (const st of sf.statements) {
    const spec =
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier
        ? st.moduleSpecifier
        : undefined;
    if (spec && ts.isStringLiteral(spec) && spec.text.startsWith(".")) {
      found.push(spec.text);
    }
  }
  return found;
}

/** Does `spec`, imported from `fromPath`, match a file in the project? */
function resolves(spec: string, fromPath: string, paths: Set<string>): boolean {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromPath), spec)
  );
  if (paths.has(base)) return true;
  for (const ext of SCRIPT_EXT) if (paths.has(base + ext)) return true;
  for (const ext of SCRIPT_EXT) if (paths.has(`${base}/index${ext}`)) return true;
  return false;
}

function checkReact(files: ProjectFile[], capacitor = false): CheckResult {
  if (files.length === 0) return OK;

  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  const problems: string[] = [];

  // Mobile target only: Capacitor needs its own config, and webDir has
  // to match what Vite actually emits or `npx cap sync` copies nothing.
  if (capacitor) {
    const cap = files.find((f) => f.path === "capacitor.config.json");
    if (!cap) {
      problems.push("Missing capacitor.config.json — required to package this as a mobile app.");
    } else {
      try {
        const cfg = JSON.parse(cap.content) as {
          appId?: string;
          appName?: string;
          webDir?: string;
        };
        if (!cfg.appId) problems.push("capacitor.config.json is missing appId.");
        else if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(cfg.appId)) {
          problems.push(
            `capacitor.config.json appId "${cfg.appId}" is not a valid reverse-domain id ` +
              "(for example com.example.myapp)."
          );
        }
        if (!cfg.appName) problems.push("capacitor.config.json is missing appName.");
        if (cfg.webDir !== "dist") {
          problems.push(
            `capacitor.config.json webDir should be "dist" (Vite's output), got ${JSON.stringify(cfg.webDir)}.`
          );
        }
      } catch (err) {
        problems.push(
          `--- capacitor.config.json ---\nNot valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    // Capacitor serves from file:// on device. Absolute asset paths
    // resolve to the device root and the app loads a blank screen —
    // a failure that only shows up on a phone, never in preview.
    const vite = files.find((f) => f.path === "vite.config.js" || f.path === "vite.config.ts");
    if (vite && !/base\s*:\s*["'`]\.\//.test(vite.content)) {
      problems.push(
        '--- ' + vite.path + ' ---\nMissing base: "./" — Capacitor loads the app from the ' +
          "filesystem, so absolute asset paths give a blank screen on device."
      );
    }
  }

  // 1. package.json must exist and be valid JSON — a malformed one
  //    fails `npm install` before anything else is attempted.
  const pkg = files.find((f) => f.path === "package.json");
  if (!pkg) {
    problems.push("Missing package.json — a Vite + React project cannot run without one.");
  } else {
    try {
      JSON.parse(pkg.content);
    } catch (err) {
      problems.push(
        `--- package.json ---\nNot valid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // 2. Vite uses index.html at the project root as its entry point.
  if (!paths.has("index.html")) {
    problems.push("Missing index.html at the project root — Vite uses it as the entry point.");
  }

  // 3. Something has to be the app entry module.
  const hasEntry = SCRIPT_EXT.some(
    (e) => paths.has(`src/main${e}`) || paths.has(`src/index${e}`)
  );
  if (!hasEntry) {
    problems.push("Missing an entry module — expected src/main.jsx (or src/index.jsx).");
  }

  // 3b. Every declared package must be one we can actually serve.
  //     Caught here rather than in the browser: an uncatalogued package
  //     fails at runtime, minutes after the generation that chose it,
  //     and reads as a network problem rather than a wrong choice.
  const pkgRaw = files.find((f) => f.path === "package.json")?.content;
  if (pkgRaw) {
    try {
      const deps = (JSON.parse(pkgRaw) as { dependencies?: Record<string, string> }).dependencies ?? {};
      const unknown = Object.keys(deps).filter((d) => !inCatalogue(d));
      if (unknown.length) {
        problems.push(
          "--- package.json ---\nThese packages are not available: " +
            unknown.map((u) => `"${u}"`).join(", ") +
            ".\nOnly these may be used: " + CATALOGUE.map((p) => p.name).join(", ") +
            ".\nRemove the imports, or rebuild that part with a package from the list."
        );
      }
    } catch { /* the malformed-json case is already reported above */ }
  }

  // 4. Every script file must parse.
  const scripts = files.filter((f) => SCRIPT_EXT.some((e) => f.path.endsWith(e)));
  const parseErrors = new Map<string, string[]>();
  for (const f of scripts) {
    const errs = parseProblems(f);
    parseErrors.set(f.path, errs);
    if (errs.length) problems.push(`--- ${f.path} ---\n${errs.join("\n")}`);
  }

  // 5. Every relative import must point at a file that exists. This is
  //    the check that earns its keep — models routinely import
  //    <Header /> from a file they forgot to write.
  //    Skipped for files that failed to parse: their AST is unreliable.
  for (const f of scripts) {
    if (parseErrors.get(f.path)?.length) continue;
    const missing = relativeImports(f).filter((s) => !resolves(s, f.path, paths));
    if (missing.length) {
      problems.push(
        `--- ${f.path} ---\nImports files that do not exist in this project: ` +
          missing.map((m) => `"${m}"`).join(", ") +
          "\nEither create those files or remove the imports."
      );
    }
  }

  return report(problems);
}

// ─────────────────────────────────────────────────────────────
// Flutter — dart analyze when available, structure otherwise
// ─────────────────────────────────────────────────────────────

let cachedDart: string | null | undefined;

function dartCmd(): string | null {
  if (cachedDart !== undefined) return cachedDart;
  try {
    const r = spawnSync("dart", ["--version"], { encoding: "utf8", timeout: 5000 });
    cachedDart = r.status === 0 ? "dart" : null;
  } catch {
    cachedDart = null;
  }
  return cachedDart;
}

function checkFlutter(files: ProjectFile[]): CheckResult {
  if (files.length === 0) return OK;
  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  const problems: string[] = [];

  if (!paths.has("pubspec.yaml")) {
    problems.push("Missing pubspec.yaml — a Flutter project cannot build without it.");
  }
  if (!paths.has("lib/main.dart")) {
    problems.push("Missing lib/main.dart — Flutter needs it as the entry point.");
  }

  // Truncation guard: a .dart file that does not end on a closing brace
  // was almost certainly cut off mid-write.
  for (const f of files.filter((f) => f.path.endsWith(".dart"))) {
    const trimmed = f.content.trimEnd();
    if (trimmed && !trimmed.endsWith("}")) {
      problems.push(
        `--- ${f.path} ---\nFile appears truncated — it does not end with a closing brace. ` +
          "Output the complete file."
      );
    }
  }

  const dart = dartCmd();
  if (!dart) {
    // Structural findings still stand; we just cannot claim the Dart
    // itself is valid, so an all-clear here reports checked: false.
    return problems.length ? report(problems) : OK;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-dart-"));
  try {
    for (const f of files) {
      const p = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.content);
    }
    const r = spawnSync(dart, ["analyze", "--no-fatal-infos", "--no-fatal-warnings", dir], {
      encoding: "utf8",
      timeout: 60000,
    });
    if (r.status !== 0) {
      const msg = (r.stdout || r.stderr || "unknown error").split(dir + path.sep).join("");
      problems.push(`--- dart analyze ---\n${msg.trim().slice(0, 2000)}`);
    }
    return report(problems);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────
// Godot — structure and scene→script references
// ─────────────────────────────────────────────────────────────

function checkGodot(files: ProjectFile[]): CheckResult {
  if (files.length === 0) return OK;
  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  const problems: string[] = [];

  if (!paths.has("project.godot")) {
    problems.push("Missing project.godot — Godot cannot open the project without it.");
  }
  if (![...paths].some((p) => p.endsWith(".tscn"))) {
    problems.push("No .tscn scene file — the game has nothing to run.");
  }

  // Scenes reference scripts by res:// path. A scene pointing at a
  // script that was never written opens as a broken project.
  const RES = /res:\/\/([A-Za-z0-9_\-./]+\.gd)/g;
  for (const scene of files.filter((f) => f.path.endsWith(".tscn"))) {
    const missing = new Set<string>();
    for (const m of scene.content.matchAll(RES)) {
      const target = m[1];
      if (target && !paths.has(target)) missing.add(target);
    }
    if (missing.size) {
      problems.push(
        `--- ${scene.path} ---\nReferences scripts that do not exist: ` +
          [...missing].map((m) => `res://${m}`).join(", ")
      );
    }
  }

  return report(problems);
}

// ─────────────────────────────────────────────────────────────

export function checkProject(targetId: string, files: ProjectFile[]): CheckResult {
  switch (targetId) {
    case "python":
      return checkPython(files);
    case "react":
      return checkReact(files);
    case "mobile":
      return checkReact(files, true);
    case "flutter":
      return checkFlutter(files);
    case "godot":
      return checkGodot(files);
    default:
      // web (single-file HTML never reaches here), book, video — no
      // meaningful automated check yet.
      return OK;
  }
}
