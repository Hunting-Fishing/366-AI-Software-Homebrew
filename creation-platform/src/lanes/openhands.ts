// LANE B — OpenHands agent adapter.
//
// Talks to an OpenHands agent-server over HTTP with fetch, no SDK —
// same house style as services/supabase.ts and services/auth.ts.
//
// WHY THIS LANE EXISTS
// Lane A re-sends the whole project on every edit and asks for the whole
// project back. Cost and latency scale with project size, and nothing
// stops the model rewriting files you did not ask it to touch. OpenHands
// is built for iterative work on an existing codebase.
//
// SETUP: docs/step-03-openhands.md
//
// ── Known limitations of this first version ──────────────────────
//
// 1. NO TOKEN STREAMING. The agent-server's OpenAI-compatible gateway
//    rejects `stream: true` with a 400. Lane B therefore shows one
//    status line, then the finished result — it does not type the code
//    out live the way Lane A does. Moving to the native conversation
//    API + its event WebSocket would restore streaming; that is the
//    next iteration, not this one.
//
// 2. FILES TRAVEL IN THE PROMPT, NOT A WORKSPACE. The gateway has no
//    file-upload channel, so this version still sends the project as
//    text. That means it does not yet deliver the full surgical-edit
//    benefit — it buys better editing behaviour from a stronger agent
//    loop, not a smaller payload. Uploading into a real agent workspace
//    needs the native API and is tracked in the same doc.
//
// Both limitations are why `SANDBOX`-style graceful decline matters
// below: if this lane cannot help, it must get out of the way rather
// than fail the user's request.

import { parseFiles, serializeFiles } from "../lib/files.js";
import { getTarget } from "../targets.js";
import { LaneUnavailableError } from "./errors.js";
import type { AgentEvent, AgentLane, LaneMode, LaneRequest } from "./types.js";

/** Targets where editing an existing codebase is the normal workflow. */
const EDITABLE_TARGETS = new Set(["web", "react", "mobile", "flutter", "python"]);

export interface OpenHandsConfig {
  serverUrl: string;
  sessionApiKey: string;
  profile: string;
  llmModel: string;
  llmApiKey: string;
  timeoutMs: number;
}

/** Read config from the environment. Returns null when not set up. */
export function openhandsConfig(): OpenHandsConfig | null {
  const serverUrl = process.env.OPENHANDS_SERVER_URL?.replace(/\/$/, "");
  if (!serverUrl) return null;

  // The agent-server needs a key for the model IT will call. Reuse the
  // platform's Anthropic key unless one is set explicitly.
  const llmApiKey =
    process.env.OPENHANDS_LLM_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  if (!llmApiKey) return null;

  return {
    serverUrl,
    sessionApiKey: process.env.OPENHANDS_SESSION_API_KEY ?? "",
    profile: process.env.OPENHANDS_PROFILE || "creation_platform",
    // LiteLLM naming convention: provider/model.
    llmModel: process.env.OPENHANDS_LLM_MODEL || "anthropic/claude-sonnet-4-5",
    llmApiKey,
    timeoutMs: Number(process.env.OPENHANDS_TIMEOUT_MS) || 600_000,
  };
}

export function openhandsConfigured(): boolean {
  return openhandsConfig() !== null;
}

function headers(cfg: OpenHandsConfig, extra: Record<string, string> = {}) {
  const h: Record<string, string> = { "content-type": "application/json", ...extra };
  if (cfg.sessionApiKey) {
    h["authorization"] = `Bearer ${cfg.sessionApiKey}`;
    h["x-session-api-key"] = cfg.sessionApiKey;
  }
  return h;
}

/**
 * fetch, with network-level failures converted to LaneUnavailableError.
 *
 * This wrapper is not optional. A bare `fetch` to a dead server rejects
 * with a plain TypeError("fetch failed"), which the router does NOT
 * treat as recoverable — so a stopped agent-server would surface as a
 * hard error to the user instead of quietly falling back to Lane A.
 * Every outbound call in this file goes through here.
 */
async function laneFetch(
  cfg: OpenHandsConfig,
  path: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(`${cfg.serverUrl}${path}`, init);
  } catch (err) {
    throw new LaneUnavailableError(
      `OpenHands server unreachable at ${cfg.serverUrl}: ` +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

/**
 * Create the LLM profile that backs the gateway model. Safe to call
 * repeatedly — an already-existing profile is not an error for us.
 */
async function ensureProfile(cfg: OpenHandsConfig, signal: AbortSignal): Promise<void> {
  const res = await laneFetch(cfg, `/api/profiles/${cfg.profile}`, {
    method: "POST",
    headers: headers(cfg),
    signal,
    body: JSON.stringify({
      llm: { model: cfg.llmModel, api_key: cfg.llmApiKey },
      include_secrets: true,
    }),
  });
  // 201 created; 409/422 typically mean it already exists.
  if (res.ok || res.status === 409 || res.status === 422) return;
  throw new LaneUnavailableError(
    `OpenHands profile setup failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`
  );
}

/**
 * Continuity between edits. The gateway does not rebuild agent history
 * from the messages array — you hand back the conversation id instead.
 * In-memory only: a restart starts fresh conversations, which is
 * correct-but-forgetful rather than broken.
 */
const conversationIds = new Map<string, string>();

export const openhandsLane: AgentLane = {
  id: "openhands",
  label: "OpenHands agent",

  supports(target: string, mode: LaneMode): boolean {
    // Config check only — no network call, because supports() is sync
    // and must stay cheap. Unreachability is handled in run() by
    // throwing LaneUnavailableError, which makes the router fall
    // through to Lane A before any event reaches the browser.
    if (!openhandsConfigured()) return false;
    if (mode !== "edit") return false;
    return EDITABLE_TARGETS.has(target);
  },

  async *run(req: LaneRequest): AsyncGenerator<AgentEvent> {
    const cfg = openhandsConfig();
    if (!cfg) throw new LaneUnavailableError("OpenHands is not configured.");

    const target = getTarget(req.target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      await ensureProfile(cfg, controller.signal);

      const existing =
        req.files.length > 0 ? serializeFiles(req.files) : (req.code ?? "");

      const key = req.projectId ?? "default";
      const priorConversation = conversationIds.get(key);

      const instruction =
        "You are editing an existing project. Make ONLY the change requested — " +
        "do not rewrite files that the change does not require.\n\n" +
        "Current project:\n\n" + existing + "\n\n" +
        "Requested change: " + req.prompt + "\n\n" +
        "Reply with the COMPLETE content of every file you changed, and only " +
        "those files, in this exact format:\n" +
        "===FILE: path/of/file.ext===\n<file content>\n===ENDFILE===";

      // NOTHING is yielded before the request succeeds. The router can
      // only fall back to Lane A while this lane has emitted zero
      // events, so an early "working on it…" chunk would trade a silent
      // recovery for a hard error every time the server is down.
      const res = await laneFetch(cfg, "/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: headers(
          cfg,
          priorConversation
            ? { "x-openhands-serverconversation-id": priorConversation }
            : {}
        ),
        body: JSON.stringify({
          model: `openhands_${cfg.profile}`,
          messages: [
            { role: "system", content: target.systemPrompt },
            { role: "user", content: instruction },
          ],
        }),
      });

      if (!res.ok) {
        throw new LaneUnavailableError(
          `OpenHands returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
        );
      }

      const convoId = res.headers.get("x-openhands-serverconversation-id");
      if (convoId) conversationIds.set(key, convoId);

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        throw new LaneUnavailableError("OpenHands returned an empty reply.");
      }

      yield { type: "chunk", text: content };

      if (target.mode === "single-html") {
        yield { type: "done", target: target.id, code: content.trim() };
        return;
      }

      // Merge: the agent returns only changed files, so start from the
      // originals and overwrite. Lane A returns everything, so this is
      // the one behavioural difference the caller sees.
      const changed = parseFiles(content, target.fallbackFile);
      const merged = new Map(req.files.map((f) => [f.path, f]));
      for (const f of changed) merged.set(f.path, f);

      yield { type: "done", target: target.id, files: [...merged.values()] };
    } finally {
      clearTimeout(timer);
    }
  },
};
