/**
 * Thrown by a lane that cannot serve a request — not configured, server
 * unreachable, empty reply.
 *
 * The router treats this as "try the next lane" rather than a failure,
 * BUT only if the lane has not yet emitted an event. Once bytes have
 * reached the browser we are committed: silently restarting on another
 * lane would replay chunks into a view that already has content.
 *
 * Anything else a lane throws is a real error and surfaces to the user.
 */
export class LaneUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaneUnavailableError";
  }
}
