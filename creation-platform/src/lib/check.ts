// Auto-check: validate generated code before showing it to the
// user. If errors are found, the generate route feeds them back
// to the model for an automatic fix (the "error-fix loop").
//
// Today: Python syntax checking via py_compile (if Python is
// installed on this machine — skipped gracefully if not).
// The structure supports adding `dart analyze`, `godot --check`
// etc. later: one function per target.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectFile } from "./files.js";

export interface CheckResult {
  ok: boolean;
  /** Human/model-readable error report (empty when ok). */
  errors: string;
  /** False when no checker is available on this machine. */
  checked: boolean;
}

const OK: CheckResult = { ok: true, errors: "", checked: false };

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
    return {
      ok: problems.length === 0,
      errors: problems.join("\n"),
      checked: true,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function checkProject(targetId: string, files: ProjectFile[]): CheckResult {
  switch (targetId) {
    case "python":
      return checkPython(files);
    // future: case "flutter": dart analyze; case "godot": gdscript check
    default:
      return OK;
  }
}
