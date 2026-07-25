// Preflight check. Runs before the server starts and explains, in
// plain English, what is configured and what is not.
//
// The rule here: never fail on something optional. Missing FFmpeg
// means no video studio, not a broken app. Only two things are truly
// required — a model key and, if Supabase is half-configured, the
// other half. Everything else is a feature you have not switched on
// yet, and the output should read that way.

import "dotenv/config";
import { spawnSync } from "node:child_process";

const G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", D = "\x1b[2m", X = "\x1b[0m";

interface Line {
  ok: boolean;
  fatal: boolean;
  label: string;
  detail: string;
}

const lines: Line[] = [];

function has(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim() && !v.trim().startsWith("<"));
}

function binary(cmd: string, args: string[] = ["--version"]): boolean {
  try {
    return spawnSync(cmd, args, { timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

// ── the one genuinely required thing ─────────────────────────
const models = [
  ["ANTHROPIC_API_KEY", "Claude"],
  ["OPENAI_API_KEY", "ChatGPT"],
  ["GOOGLE_API_KEY", "Gemini"],
] as const;
const configuredModels = models.filter(([k]) => has(k));

lines.push({
  ok: configuredModels.length > 0,
  fatal: configuredModels.length === 0,
  label: "AI model",
  detail:
    configuredModels.length > 0
      ? configuredModels.map(([, n]) => n).join(", ")
      : "No model key. Add ANTHROPIC_API_KEY to creation-platform/.env — " +
        "get one at https://console.anthropic.com",
});

// ── storage ──────────────────────────────────────────────────
const hasUrl = has("SUPABASE_URL");
const hasService = has("SUPABASE_SERVICE_KEY");

if (hasUrl && hasService) {
  lines.push({ ok: true, fatal: false, label: "Storage", detail: "Supabase — projects survive restarts" });
} else if (hasUrl !== hasService) {
  lines.push({
    ok: false,
    fatal: false,
    label: "Storage",
    detail:
      `Half-configured: ${hasUrl ? "SUPABASE_SERVICE_KEY" : "SUPABASE_URL"} is missing. ` +
      "Falling back to local JSON files. Supabase needs BOTH.",
  });
} else {
  lines.push({
    ok: true,
    fatal: false,
    label: "Storage",
    detail: "Local JSON files — fine on one machine, lost if you redeploy a server",
  });
}

// ── who can get in ───────────────────────────────────────────
if (hasUrl && has("SUPABASE_ANON_KEY")) {
  lines.push({ ok: true, fatal: false, label: "Sign-in", detail: "Per-user accounts" });
} else if (has("ACCESS_PASSWORD")) {
  lines.push({ ok: true, fatal: false, label: "Sign-in", detail: "One shared team password" });
} else {
  lines.push({
    ok: true,
    fatal: false,
    label: "Sign-in",
    detail:
      "OPEN — no sign-in at all. Correct for your own machine. " +
      "NEVER put this on the internet without ACCESS_PASSWORD set.",
  });
}

// ── optional capabilities ────────────────────────────────────
const python = binary("python3") || binary("python");
lines.push({
  ok: python,
  fatal: false,
  label: "Python preview",
  detail: python
    ? "Available — generated Flask apps run in the browser"
    : "Not installed. Python targets still generate and download; they just cannot preview live.",
});

const ffmpeg = binary("ffmpeg", ["-version"]);
lines.push({
  ok: ffmpeg,
  fatal: false,
  label: "Video studio",
  detail: ffmpeg
    ? "FFmpeg found — movie assembly, narration and music work"
    : "FFmpeg not installed. Video plans still generate; assembly is unavailable. (winget install ffmpeg)",
});

lines.push({
  ok: has("NETLIFY_TOKEN"),
  fatal: false,
  label: "Publish button",
  detail: has("NETLIFY_TOKEN")
    ? "Ready — generated apps can go live on a public URL"
    : "Off. Add NETLIFY_TOKEN to publish generated apps to the web.",
});

lines.push({
  ok: has("OPENHANDS_SERVER_URL"),
  fatal: false,
  label: "Agent lane B",
  detail: has("OPENHANDS_SERVER_URL")
    ? "OpenHands configured — edits route to the agent"
    : "Off. Edits use the in-house loop. See docs/step-03-openhands.md",
});

// ── report ───────────────────────────────────────────────────

export function runDoctor(): boolean {
  const fatals = lines.filter((l) => l.fatal);

  console.log("");
  console.log("  ┌─ Startup check ────────────────────────────────────");
  for (const l of lines) {
    const mark = l.fatal ? `${R}✗${X}` : l.ok ? `${G}✓${X}` : `${Y}!${X}`;
    console.log(`  │ ${mark} ${l.label.padEnd(15)} ${D}${l.detail}${X}`);
  }
  console.log("  └────────────────────────────────────────────────────");

  if (fatals.length > 0) {
    console.log("");
    console.log(`  ${R}Cannot start yet.${X}`);
    for (const f of fatals) console.log(`    • ${f.detail}`);
    console.log("");
    console.log(`  ${D}Open  creation-platform\\.env  and fill in the lines marked${X}`);
    console.log(`  ${D}"FILL THIS IN", save, then run this again.${X}`);
    console.log("");
    return false;
  }
  return true;
}

// Allow `npm run doctor` to run it standalone.
if (process.argv[1]?.endsWith("doctor.ts")) {
  process.exit(runDoctor() ? 0 : 1);
}
