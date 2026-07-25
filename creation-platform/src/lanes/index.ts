// Lane registry and router.
//
// Lanes are tried in priority order; the first that says it supports the
// request wins. Lane A ("inhouse") always supports everything, so it
// must stay last — it is the fallback.
//
// If a specialised lane turns out to be unavailable at run time (server
// down, misconfigured), it throws LaneUnavailableError and the router
// falls through to the next lane — but only if nothing has been emitted
// yet. See errors.ts for why that condition matters.

import { inhouseLane } from "./inhouse.js";
import { openhandsLane } from "./openhands.js";
import { LaneUnavailableError } from "./errors.js";
import {
  modeOf,
  type AgentEvent,
  type AgentLane,
  type LaneMode,
  type LaneRequest,
} from "./types.js";

/** Priority order. Most specialised first, fallback last. */
const lanes: AgentLane[] = [openhandsLane, inhouseLane];

export function allLanes(): ReadonlyArray<Pick<AgentLane, "id" | "label">> {
  return lanes.map((l) => ({ id: l.id, label: l.label }));
}

/** Every lane willing to take this request, in priority order. */
export function candidateLanes(target: string, mode: LaneMode): AgentLane[] {
  return lanes.filter((l) => l.supports(target, mode));
}

/**
 * Pick the lane for a request.
 *
 * Guaranteed to return a lane: inhouseLane.supports() is always true,
 * so there is no "no lane found" path to handle at the call site.
 */
export function selectLane(target: string, mode: LaneMode): AgentLane {
  const lane = candidateLanes(target, mode)[0];
  if (!lane) {
    // Unreachable while inhouseLane is registered, but a future
    // refactor that removes it should fail loudly rather than silently.
    throw new Error(`No agent lane supports target "${target}" in mode "${mode}".`);
  }
  return lane;
}

/**
 * Run the request, falling through to the next candidate lane if one
 * declines before emitting anything.
 */
export async function* runLane(req: LaneRequest): AsyncGenerator<AgentEvent> {
  const mode = modeOf(req);
  const candidates = candidateLanes(req.target, mode);

  for (let i = 0; i < candidates.length; i++) {
    const lane = candidates[i]!;
    const isLast = i === candidates.length - 1;
    let emitted = false;

    try {
      for await (const event of lane.run(req)) {
        emitted = true;
        yield event;
      }
      return;
    } catch (err) {
      const recoverable = err instanceof LaneUnavailableError && !emitted && !isLast;
      if (!recoverable) throw err;
      console.warn(
        `[lanes] ${lane.id} declined (${(err as Error).message}) — falling back to ${candidates[i + 1]!.id}`
      );
    }
  }
}

export { modeOf, LaneUnavailableError };
export type { AgentLane, LaneMode, LaneRequest };
export type {
  AgentEvent,
  WireEvent,
  ChunkEvent,
  FixingEvent,
  DoneEvent,
  ErrorEvent,
} from "./types.js";
