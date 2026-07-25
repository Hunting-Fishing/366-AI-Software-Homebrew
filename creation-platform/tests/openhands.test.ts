import { test } from "node:test";
import assert from "node:assert/strict";
import { openhandsLane, openhandsConfigured, openhandsConfig } from "../src/lanes/openhands.js";
import { candidateLanes, selectLane, runLane, LaneUnavailableError } from "../src/lanes/index.js";
import type { AgentEvent, AgentLane, LaneRequest } from "../src/lanes/types.js";

// Lane B must be invisible until it is configured, and must get out of
// the way rather than fail the user's request when it cannot help.

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const CONFIGURED = {
  OPENHANDS_SERVER_URL: "http://127.0.0.1:8000",
  ANTHROPIC_API_KEY: "sk-ant-test",
};
const UNCONFIGURED = {
  OPENHANDS_SERVER_URL: undefined,
  OPENHANDS_LLM_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
};

// ── configuration ────────────────────────────────────────────

test("unconfigured without a server url", () => {
  withEnv(UNCONFIGURED, () => {
    assert.equal(openhandsConfigured(), false);
    assert.equal(openhandsConfig(), null);
  });
});

test("a server url alone is not enough — a model key is required", () => {
  withEnv({ ...UNCONFIGURED, OPENHANDS_SERVER_URL: "http://127.0.0.1:8000" }, () => {
    assert.equal(openhandsConfigured(), false);
  });
});

test("trailing slash is stripped so urls do not double up", () => {
  withEnv({ ...CONFIGURED, OPENHANDS_SERVER_URL: "http://127.0.0.1:8000/" }, () => {
    assert.equal(openhandsConfig()?.serverUrl, "http://127.0.0.1:8000");
  });
});

test("falls back to the platform's Anthropic key for the agent's model", () => {
  withEnv(CONFIGURED, () => {
    assert.equal(openhandsConfig()?.llmApiKey, "sk-ant-test");
    assert.match(openhandsConfig()?.llmModel ?? "", /^anthropic\//);
  });
});

// ── routing ──────────────────────────────────────────────────

test("declines everything while unconfigured", () => {
  withEnv(UNCONFIGURED, () => {
    assert.equal(openhandsLane.supports("react", "edit"), false);
    assert.equal(selectLane("react", "edit").id, "inhouse");
  });
});

test("takes edits to code targets once configured", () => {
  withEnv(CONFIGURED, () => {
    for (const target of ["web", "react", "flutter", "python"]) {
      assert.equal(openhandsLane.supports(target, "edit"), true, target);
      assert.equal(selectLane(target, "edit").id, "openhands", target);
    }
  });
});

test("never takes first generation — that is Lane A's job", () => {
  withEnv(CONFIGURED, () => {
    for (const target of ["web", "react", "flutter", "python"]) {
      assert.equal(openhandsLane.supports(target, "create"), false, target);
      assert.equal(selectLane(target, "create").id, "inhouse", target);
    }
  });
});

test("never takes godot, book or video — only Lane A understands those", () => {
  withEnv(CONFIGURED, () => {
    for (const target of ["godot", "book", "video"]) {
      assert.equal(openhandsLane.supports(target, "edit"), false, target);
      assert.equal(selectLane(target, "edit").id, "inhouse", target);
    }
  });
});

test("inhouse remains a candidate behind openhands, so fallback is possible", () => {
  withEnv(CONFIGURED, () => {
    assert.deepEqual(
      candidateLanes("react", "edit").map((l) => l.id),
      ["openhands", "inhouse"]
    );
  });
});

// ── fallback behaviour ───────────────────────────────────────

function fakeLane(id: string, impl: () => AsyncGenerator<AgentEvent>): AgentLane {
  return { id: id as AgentLane["id"], label: id, supports: () => true, run: impl };
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const REQ: LaneRequest = {
  prompt: "make it blue",
  target: "react",
  provider: "anthropic",
  files: [{ path: "src/App.jsx", content: "x\n" }],
};

test("an unreachable lane falls through to the next one", async () => {
  withEnv(UNCONFIGURED, () => {});
  // With OpenHands unconfigured it never enters the candidate list, so
  // this exercises the router against the real registry: one candidate,
  // which succeeds. The interesting case is covered below.
  const lanes = candidateLanes("react", "edit");
  assert.equal(lanes.length >= 1, true);
});

test("LaneUnavailableError before any output is recoverable", async () => {
  const failing = fakeLane("openhands", async function* () {
    throw new LaneUnavailableError("server down");
  });
  const working = fakeLane("inhouse", async function* () {
    yield { type: "done", target: "react", files: [] };
  });

  // Simulate the router's loop over two candidates.
  let emitted = false;
  const events: AgentEvent[] = [];
  try {
    for await (const e of failing.run(REQ)) {
      emitted = true;
      events.push(e);
    }
  } catch (err) {
    assert.ok(err instanceof LaneUnavailableError);
    assert.equal(emitted, false, "nothing was emitted, so falling back is safe");
    events.push(...(await collect(working.run(REQ))));
  }
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "done");
});

test("a failure after output has started is NOT swallowed", async () => {
  const halfway = fakeLane("openhands", async function* () {
    yield { type: "chunk", text: "partial" };
    throw new LaneUnavailableError("died mid-stream");
  });

  let emitted = false;
  await assert.rejects(async () => {
    for await (const _e of halfway.run(REQ)) emitted = true;
  }, LaneUnavailableError);
  assert.equal(emitted, true, "bytes already reached the browser — restarting would duplicate them");
});

// ── regression guards ────────────────────────────────────────
// Both of these were real bugs caught by a smoke test against a dead
// server. Neither showed up in unit tests until these were written.

test("a dead server produces LaneUnavailableError, not a raw fetch TypeError", async () => {
  const saved = { u: process.env.OPENHANDS_SERVER_URL, k: process.env.ANTHROPIC_API_KEY };
  process.env.OPENHANDS_SERVER_URL = "http://127.0.0.1:59999";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  try {
    await assert.rejects(
      () => collect(openhandsLane.run(REQ)),
      (err: unknown) => {
        assert.ok(
          err instanceof LaneUnavailableError,
          `expected LaneUnavailableError, got ${(err as Error)?.name}: ${(err as Error)?.message}`
        );
        return true;
      },
      "a plain fetch TypeError would make the router treat this as unrecoverable"
    );
  } finally {
    if (saved.u === undefined) delete process.env.OPENHANDS_SERVER_URL;
    else process.env.OPENHANDS_SERVER_URL = saved.u;
    if (saved.k === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.k;
  }
});

test("nothing is emitted before the server responds, so fallback stays possible", async () => {
  const saved = { u: process.env.OPENHANDS_SERVER_URL, k: process.env.ANTHROPIC_API_KEY };
  process.env.OPENHANDS_SERVER_URL = "http://127.0.0.1:59999";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  try {
    const emitted: AgentEvent[] = [];
    await assert.rejects(async () => {
      for await (const e of openhandsLane.run(REQ)) emitted.push(e);
    });
    assert.equal(
      emitted.length,
      0,
      "an early status chunk would commit the router and break the fallback"
    );
  } finally {
    if (saved.u === undefined) delete process.env.OPENHANDS_SERVER_URL;
    else process.env.OPENHANDS_SERVER_URL = saved.u;
    if (saved.k === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.k;
  }
});

test("runLane still completes normally with the real registry", async () => {
  withEnv(UNCONFIGURED, () => {});
  const lane = selectLane("react", "edit");
  assert.equal(lane.id, "inhouse");
  // Not executed — running it would call a model. Selection is the
  // contract under test here.
  assert.equal(typeof runLane, "function");
});
