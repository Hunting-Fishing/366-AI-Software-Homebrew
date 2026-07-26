// ─────────────────────────────────────────────────────────────
// The two-lane seam.
//
// LANE A ("inhouse") — the existing generation loop: per-target
//   expert prompts, whole-file streaming output, auto-fix pass.
//   Owns first generation and every target nothing else can do
//   (Godot, book, video).
//
// LANE B ("openhands") — an OpenHands agent-server adapter, to be
//   added. Owns iterative edits to real codebases, where surgical
//   diffs beat regenerating every file.
//
// Both lanes read and write the SAME thing: ProjectFile[], which
// lib/files.ts already defines and Supabase already persists in
// projects.files. And both emit the SAME event shape the browser
// already speaks — so adding Lane B changes no frontend code.
// ─────────────────────────────────────────────────────────────

import type { ProjectFile } from "../lib/files.js";

/** Create a new project, or edit one that already exists. */
export type LaneMode = "create" | "edit";

export interface LaneRequest {
  prompt: string;
  /** Target id from targets.ts — "web", "react", "flutter", "godot", ... */
  target: string;
  /** Model provider id — "anthropic", "openai", "google". */
  provider: string;
  /** Existing multi-file project, empty for a new one. */
  files: ProjectFile[];
  /** Existing single-file HTML project, if the target is single-html. */
  code?: string;
  /**
   * Saved project id, when the browser knows one. Lane B uses it to keep
   * one OpenHands conversation per project across edits instead of
   * starting cold every time.
   */
  projectId?: string;
}

// ── Wire events ──────────────────────────────────────────────
// These match exactly what public/index.html already parses.
// Do not change a field name without changing the frontend.

/** A piece of model output, streamed as it arrives. */
export interface ChunkEvent {
  type: "chunk";
  text: string;
}

/** The auto-fix pass found errors and is asking for a correction. */
export interface FixingEvent {
  type: "fixing";
  errors: string;
}

/**
 * The build finished but the result is still broken.
 *
 * Previously this case was silent: the auto-fix pass ran, produced
 * something no better, and the user was told "Updated!". A project
 * can stay broken across many builds that way, because nothing ever
 * says otherwise.
 */
export interface UnhealthyEvent {
  type: "unhealthy";
  errors: string;
  /** Files the retry dropped that the original had. */
  lost?: string[];
}

/**
 * The build worked, but something outside the edited files depended on
 * a name that is now gone: a storage collection, a route, a saved
 * setting. Not an error — deleting a feature legitimately deletes its
 * route — but never something to discover weeks later.
 */
export interface ContractEvent {
  type: "contracts";
  losses: Array<{ kind: string; name: string; why: string }>;
}

/** Finished. Single-html targets carry `code`; multi-file carry `files`. */
export interface DoneEvent {
  type: "done";
  target: string;
  code?: string;
  files?: ProjectFile[];
  /** Paths created by this build. */
  added?: string[];
  /** Paths whose content changed. Re-sent-but-identical is neither. */
  modified?: string[];
  /** Paths explicitly deleted. */
  removed?: string[];
}

/** Emitted by lanes. */
export type AgentEvent = ChunkEvent | FixingEvent | UnhealthyEvent | ContractEvent | DoneEvent;

/** Emitted by the route — lanes throw, the route frames the failure. */
export interface ErrorEvent {
  type: "error";
  message: string;
}

export type WireEvent = AgentEvent | ErrorEvent;

// ── The lane contract ────────────────────────────────────────

export interface AgentLane {
  id: "inhouse" | "openhands";
  label: string;

  /**
   * Can this lane handle this target in this mode?
   * The router asks every lane in priority order and takes the first
   * that says yes, so a lane that is not configured (no server URL,
   * no key) must answer false rather than throwing later.
   */
  supports(target: string, mode: LaneMode): boolean;

  /** Run the request, streaming events as work progresses. */
  run(req: LaneRequest): AsyncGenerator<AgentEvent>;
}

/** Whether a request is creating something new or editing what exists. */
export function modeOf(req: Pick<LaneRequest, "files" | "code">): LaneMode {
  const hasFiles = req.files.length > 0;
  const hasCode = Boolean(req.code && req.code.trim());
  return hasFiles || hasCode ? "edit" : "create";
}
