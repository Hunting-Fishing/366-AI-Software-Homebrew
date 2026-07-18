// Live preview runner: executes a generated Python (Flask) app
// locally and serves it to the browser — "web based, not just
// download a ZIP". One preview runs at a time; starting a new
// one stops the old one.
//
// SECURITY NOTE (documented in docs/PHASES.md): this runs
// AI-generated code on this machine. That's acceptable for our
// own in-house use with our own generations. Before offering
// this to outside users, it MUST move into real sandboxing
// (Docker/Firecracker — Phase 3). Do not expose this server to
// the public internet as-is.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { ProjectFile } from "../lib/files.js";

export function pythonCmd(): string | null {
  for (const cmd of ["python3", "python"]) {
    try {
      const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 5000 });
      if (r.status === 0) return cmd;
    } catch {
      /* not installed under this name */
    }
  }
  return null;
}

// Rewrite the generated app so it binds to our chosen port and
// never uses Flask's debug reloader (which breaks process cleanup).
export function prepareForRun(files: ProjectFile[], port: number): ProjectFile[] {
  return files.map((f) => {
    if (!f.path.endsWith(".py")) return f;
    let content = f.content.replace(/debug\s*=\s*True/g, "debug=False");
    if (content.includes("app.run(")) {
      content = content.replace(
        /app\.run\(/,
        `app.run(host="127.0.0.1", port=${port}, `
      );
    }
    return { ...f, content };
  });
}

function waitForPort(port: number, tries = 30, delayMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let attempt = 0;
    const tryOnce = () => {
      const socket = net.connect({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        attempt += 1;
        if (attempt >= tries) resolve(false);
        else setTimeout(tryOnce, delayMs);
      });
    };
    tryOnce();
  });
}

export class PreviewRunner {
  private child: ChildProcess | null = null;
  private dir: string | null = null;

  async start(files: ProjectFile[]): Promise<{ url: string }> {
    this.stop();

    const py = pythonCmd();
    if (!py) {
      throw new Error(
        "Python is not installed on this machine. Install it from https://python.org, then try again."
      );
    }
    const hasApp = files.some((f) => f.path === "app.py");
    if (!hasApp) throw new Error("This project has no app.py to run.");

    const port = 5100 + Math.floor(Math.random() * 400);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-preview-"));
    for (const f of prepareForRun(files, port)) {
      const p = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.content);
    }

    let errOutput = "";
    const child = spawn(py, ["app.py"], {
      cwd: dir,
      env: { ...process.env, PORT: String(port), FLASK_DEBUG: "0" },
    });
    child.stderr?.on("data", (d: Buffer) => (errOutput += d.toString()));
    child.stdout?.on("data", (d: Buffer) => (errOutput += d.toString()));

    this.child = child;
    this.dir = dir;

    const up = await waitForPort(port);
    if (!up) {
      const detail = errOutput.slice(-1500);
      this.stop();
      const hint = /No module named/i.test(detail)
        ? "\n\nHint: install the app's dependencies first — open a terminal and run:  pip install -r requirements.txt  (or at least:  pip install flask)"
        : "";
      throw new Error("The app failed to start.\n" + detail + hint);
    }
    return { url: `http://127.0.0.1:${port}/` };
  }

  stop(): void {
    if (this.child && !this.child.killed) {
      try {
        this.child.kill();
      } catch {
        /* already gone */
      }
    }
    this.child = null;
    if (this.dir) {
      try {
        fs.rmSync(this.dir, { recursive: true, force: true });
      } catch {
        /* temp cleanup is best-effort */
      }
    }
    this.dir = null;
  }
}

export const previewRunner = new PreviewRunner();
