import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBrain, isBrain, phaseProgress, type Brain } from "../src/services/brain.js";

// The brain is the plan a project is built against. Its job is to
// survive: a planner hiccup must never cost a build, and a project
// saved before the feature existed must still open.

function sample(): Brain {
  return {
    goal: "A restaurant manager that costs meals from receipts",
    currentPhase: "p1",
    updatedAt: new Date().toISOString(),
    phases: [
      {
        id: "p1",
        name: "Receipt entry",
        goal: "Enter receipts and see them listed",
        status: "active",
        tasks: [
          { text: "Add a receipt form", done: true },
          { text: "List saved receipts", done: false },
        ],
      },
      { id: "p2", name: "Costing", goal: "Cost per meal", status: "planned", tasks: [] },
    ],
  };
}

test("a well-formed brain is recognised", () => {
  assert.equal(isBrain(sample()), true);
});

test("anything without phases is not a brain", () => {
  // Projects created before this feature have brain = {}. They must open
  // rather than throw.
  for (const v of [null, undefined, {}, { goal: "x" }, [], "brain", 7]) {
    assert.equal(isBrain(v), false, `wrongly accepted ${JSON.stringify(v)}`);
  }
});

test("emptyBrain is a valid starting point with nothing in it", () => {
  const b = emptyBrain();
  assert.equal(b.phases.length, 0);
  assert.equal(b.currentPhase, "");
  assert.equal(isBrain(b), true, "an empty brain is still shaped like one");
});

test("progress is the fraction of tasks done", () => {
  const b = sample();
  assert.equal(phaseProgress(b.phases[0]!), 0.5);
});

test("a phase with no tasks reads 0 until it is marked done", () => {
  const planned = { id: "x", name: "n", goal: "g", status: "planned" as const, tasks: [] };
  assert.equal(phaseProgress(planned), 0);
  assert.equal(phaseProgress({ ...planned, status: "done" as const }), 1,
    "a phase completed without a task list should not read as 0%");
});

test("progress never divides by zero or exceeds 1", () => {
  const all = {
    id: "x", name: "n", goal: "g", status: "active" as const,
    tasks: [{ text: "a", done: true }, { text: "b", done: true }],
  };
  assert.equal(phaseProgress(all), 1);
  assert.ok(phaseProgress(all) <= 1);
});
