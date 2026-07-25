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

/**
 * Path the preview is served on, through this server's own origin.
 *
 * The preview process listens on 127.0.0.1 INSIDE this machine. Handing
 * that address to the browser only works when the browser happens to be
 * on the same machine — true on a laptop, false for every user of a
 * deployed server, where 127.0.0.1 is their own device. So the browser
 * is given this same-origin path instead and routes/live.ts proxies it
 * through. One code path, works in both places.
 */
export const LIVE_PATH = "/live";

/**
 * Starting a preview takes 60–120 seconds for React: npm install, then
 * waiting for Vite to bind a port. It used to happen inside the
 * POST /api/preview request, which meant the browser held one HTTP
 * request open for the whole time.
 *
 * That works on localhost and fails behind a proxy. Render's edge times
 * out around 100 seconds and returns its OWN html error page, so the
 * browser's `await res.json()` blew up with "Unexpected token '<'" —
 * an error that says nothing about the real cause.
 *
 * So the request now returns immediately and the browser polls. Same
 * reason Lovable shows you a progress log instead of a frozen spinner.
 */
export type PreviewState = "idle" | "installing" | "starting" | "ready" | "error";

export interface PreviewStatus {
  state: PreviewState;
  /** Same-origin path once ready. */
  url?: string;
  /** Human-readable phase, or the failure reason. */
  message?: string;
  /** Milliseconds since this run began — drives the progress text. */
  elapsedMs?: number;
}

export class PreviewRunner {
  private child: ChildProcess | null = null;
  private dir: string | null = null;
  private activePort: number | null = null;
  private state: PreviewState = "idle";
  private message = "";
  private startedAt = 0;
  /** Incremented on every begin(), so a superseded run cannot report back. */
  private runId = 0;

  status(): PreviewStatus {
    const s: PreviewStatus = { state: this.state };
    if (this.message) s.message = this.message;
    if (this.state === "ready") s.url = LIVE_PATH + "/";
    if (this.state === "installing" || this.state === "starting") {
      s.elapsedMs = Date.now() - this.startedAt;
    }
    return s;
  }

  /**
   * Kick off a preview and return immediately. Poll status() for the
   * result. Starting a new one supersedes any run already in progress.
   */
  begin(files: ProjectFile[], vite: boolean): PreviewStatus {
    const id = ++this.runId;
    this.stop();
    this.runId = id; // stop() must not invalidate the run we just claimed
    this.state = vite ? "installing" : "starting";
    this.message = vite
      ? "Installing packages — this takes about a minute the first time"
      : "Starting the app";
    this.startedAt = Date.now();

    const work = vite ? this.startReact(files, id) : this.start(files);
    work
      .then(() => {
        if (id !== this.runId) return; // superseded
        this.state = "ready";
        this.message = "";
      })
      .catch((err: unknown) => {
        if (id !== this.runId) return;
        this.state = "error";
        this.message = err instanceof Error ? err.message : String(err);
      });

    return this.status();
  }

  /** Called by startReact between its two phases. */
  private phase(id: number, state: PreviewState, message: string): void {
    if (id !== this.runId) return;
    this.state = state;
    this.message = message;
  }

  /** Port the current preview listens on, or null when nothing is running. */
  port(): number | null {
    return this.activePort;
  }

  async start(files: ProjectFile[]): Promise<{ url: string }> {
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
    this.activePort = port;

    const up = await waitForPort(port);
    if (!up) {
      const detail = errOutput.slice(-1500);
      this.stop();
      const hint = /No module named/i.test(detail)
        ? "\n\nHint: install the app's dependencies first — open a terminal and run:  pip install -r requirements.txt  (or at least:  pip install flask)"
        : "";
      throw new Error("The app failed to start.\n" + detail + hint);
    }
    return { url: LIVE_PATH + "/" };
  }

  /** Live preview for React (Vite) projects: npm install, then
      run the dev server. First run takes ~1 minute (installing). */
  async startReact(files: ProjectFile[], runId = 0): Promise<{ url: string }> {
    if (!files.some((f) => f.path === "package.json")) {
      throw new Error("This project has no package.json to run.");
    }
    const port = 5600 + Math.floor(Math.random() * 300);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-react-"));
    for (const f of files) {
      const p = path.join(dir, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.content);
    }

    const isWin = process.platform === "win32";
    const npm = isWin ? "npm.cmd" : "npm";
    const npx = isWin ? "npx.cmd" : "npx";

    // 1. Install dependencies (uses the machine's npm cache, so
    //    repeat runs are much faster).
    //
    //    The install child is tracked so stop() can kill it. Without
    //    that, pressing "Run in browser" twice leaves the first install
    //    running to completion in the background — burning CPU on a
    //    small instance, and keeping the process alive after everything
    //    else has been torn down.
    await new Promise<void>((resolve, reject) => {
      const p = spawn(npm, ["install", "--no-audit", "--no-fund"], { cwd: dir });
      this.child = p;
      let err = "";
      p.stderr?.on("data", (d: Buffer) => (err += d.toString()));
      p.on("close", (code, signal) => {
        if (this.child === p) this.child = null;
        if (code === 0) return resolve();
        // Killed by stop() — a newer run superseded this one. Not an error.
        if (signal) return reject(new Error("Preview was cancelled."));
        // Exit 137 is SIGKILL, which on a small container almost always
        // means the OOM killer. Saying so saves a long hunt.
        const oom = code === 137 || /killed|out of memory|ENOMEM/i.test(err);
        reject(
          new Error(
            oom
              ? "Ran out of memory installing packages. The server instance is too small for a " +
                "React build — a 1GB plan or larger is needed for this target."
              : "npm install failed:\n" + err.slice(-800)
          )
        );
      });
      p.on("error", () => reject(new Error("npm not found — install Node.js from nodejs.org.")));
    });

    this.phase(runId, "starting", "Packages installed — starting the dev server");

    // 2. Start the Vite dev server.
    //    --base matters: the app is reached through this server at
    //    /live/, so Vite has to emit its asset and module URLs with
    //    that prefix. Without it the page loads and every <script> and
    //    stylesheet 404s.
    let errOutput = "";
    const child = spawn(
      npx,
      [
        "vite",
        "--port", String(port),
        "--strictPort",
        "--host", "127.0.0.1",
        "--base", LIVE_PATH + "/",
      ],
      { cwd: dir }
    );
    child.stderr?.on("data", (d: Buffer) => (errOutput += d.toString()));
    child.stdout?.on("data", (d: Buffer) => (errOutput += d.toString()));
    this.child = child;
    this.dir = dir;
    this.activePort = port;

    const up = await waitForPort(port, 60, 500);
    if (!up) {
      const detail = errOutput.slice(-1200);
      this.stop();
      throw new Error("The React dev server failed to start.\n" + detail);
    }
    return { url: LIVE_PATH + "/" };
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
    this.activePort = null;
    this.state = "idle";
    this.message = "";
    this.runId++; // any in-flight run is now superseded
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
