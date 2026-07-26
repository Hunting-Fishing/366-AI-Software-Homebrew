// The brain: a project's phase plan, and the thing that decides what to
// build next.
//
// WHY THIS EXISTS
// A generated app is never finished in one prompt. Without a plan, the
// user holds the whole roadmap in their head and has to invent the next
// prompt every time — which is the real reason people abandon these
// tools halfway. The brain keeps the plan, the AI maintains it, and
// after each build it offers concrete next steps.
//
// Two operations, both cheap single calls that return JSON. They are
// deliberately NOT part of the generation call: generation is already
// long and expensive, and a planning failure must never cost the user
// their build.

import { streamGenerate, type ChatMessage } from "../providers/index.js";
import { resolve, type Role, type Routing } from "../models.js";
import { extractJsonArray } from "../lib/extract.js";

export interface BrainTask {
  text: string;
  done: boolean;
}

export interface BrainPhase {
  id: string;
  name: string;
  /** One sentence: what this phase delivers. */
  goal: string;
  tasks: BrainTask[];
  status: "planned" | "active" | "done";
}

export interface Brain {
  /** What the whole project is for. Set once, edited rarely. */
  goal: string;
  phases: BrainPhase[];
  /** id of the phase being worked on. */
  currentPhase: string;
  updatedAt: string;
}

export function emptyBrain(): Brain {
  return { goal: "", phases: [], currentPhase: "", updatedAt: new Date().toISOString() };
}

export function isBrain(v: unknown): v is Brain {
  return Boolean(v && typeof v === "object" && Array.isArray((v as Brain).phases));
}

/** Fraction of tasks done in a phase, 0–1. */
export function phaseProgress(p: BrainPhase): number {
  if (!p.tasks.length) return p.status === "done" ? 1 : 0;
  return p.tasks.filter((t) => t.done).length / p.tasks.length;
}

// ── talking to the model ─────────────────────────────────────

/** Collect a non-streaming reply from the streaming gateway. */
async function complete(
  provider: string,
  system: string,
  user: string,
  role: Role,
  routing: Routing = {}
): Promise<string> {
  const messages: ChatMessage[] = [{ role: "user", content: user }];
  let out = "";
  // Planning and suggesting are short structured replies over a short
  // prompt. They run while the user is waiting, so speed beats depth —
  // and a mediocre suggestion costs nothing, because nobody clicks it.
  const routed = resolve(role, provider, routing);
  for await (const chunk of streamGenerate(routed.provider, system, messages, routed.model)) out += chunk;
  return out;
}

/** Pull a JSON object out of a reply that may be fenced or chatty. */
function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const src = fenced?.[1] ?? text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in the reply.");
  return JSON.parse(src.slice(start, end + 1));
}

const PLANNER_SYSTEM = `You are a product planner inside an AI app-builder.

You turn a one-line app idea into a short, sequenced build plan.

RULES:
- 3 to 5 phases. Fewer is better than more.
- Each phase delivers something the user can SEE working. Never a phase that is only setup or only refactoring.
- Order by dependency, then by value: the first phase must produce a usable app on its own.
- 3 to 6 tasks per phase. Each task is one prompt's worth of work — concrete, not "improve the UI".
- Write tasks as instructions to a builder: "Add a receipt entry form with item, weight and price".
- No timelines, no estimates, no team language.

Respond with ONLY this JSON, no prose, no fences:
{"goal":"one sentence","phases":[{"name":"Phase name","goal":"one sentence","tasks":["task","task"]}]}`;

/** Draft a plan from the user's first prompt. */
export async function planPhases(provider: string, idea: string, routing: Routing = {}): Promise<Brain> {
  const raw = await complete(provider, PLANNER_SYSTEM, "App idea: " + idea, "plan", routing);
  const parsed = extractJsonObject(raw) as {
    goal?: string;
    phases?: Array<{ name?: string; goal?: string; tasks?: string[] }>;
  };

  const phases: BrainPhase[] = (parsed.phases ?? []).slice(0, 6).map((p, i) => ({
    id: "p" + (i + 1),
    name: String(p.name ?? `Phase ${i + 1}`),
    goal: String(p.goal ?? ""),
    tasks: (p.tasks ?? []).slice(0, 8).map((t) => ({ text: String(t), done: false })),
    status: i === 0 ? "active" : "planned",
  }));

  if (!phases.length) throw new Error("The planner returned no phases.");

  return {
    goal: String(parsed.goal ?? idea),
    phases,
    currentPhase: phases[0]!.id,
    updatedAt: new Date().toISOString(),
  };
}

const ADVANCE_SYSTEM = `You are tracking progress on an app build.

You are given the plan, which phase is active, and what the user just asked for and received.

Decide two things:
1. Which tasks in the ACTIVE phase are now complete. Be strict — only mark a task done if the change described plainly covers it.
2. What the user should do next: 3 to 5 prompts, each one a single build step that moves the active phase forward.

RULES for suggestions:
- Write them as prompts the user could send verbatim: "Add a search box that filters receipts by supplier".
- Concrete and small. One feature each. Never "polish the UI" or "add tests".
- Prefer unfinished tasks in the active phase. If the phase is complete, suggest the first tasks of the next phase.
- Never suggest something the app plainly already has.

Respond with ONLY this JSON, no prose, no fences:
{"completedTasks":["exact task text",...],"phaseComplete":false,"suggestions":["prompt","prompt","prompt"]}`;

export interface AdvanceResult {
  brain: Brain;
  suggestions: string[];
}

/**
 * Update the plan after a build and propose next steps.
 *
 * Never throws for planning reasons — a build that succeeded must not be
 * reported as failed because the planner had an off moment. On failure
 * the brain is returned untouched with no suggestions.
 */
export async function advance(
  provider: string,
  brain: Brain,
  justBuilt: string,
  fileList: string[],
  routing: Routing = {}
): Promise<AdvanceResult> {
  const active = brain.phases.find((p) => p.id === brain.currentPhase);
  if (!active) return { brain, suggestions: [] };

  const user = [
    "Project goal: " + brain.goal,
    "",
    "Active phase: " + active.name + " — " + active.goal,
    "Tasks in this phase:",
    ...active.tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.text}`),
    "",
    "The user just asked for: " + justBuilt,
    "",
    "Files in the project now: " + fileList.slice(0, 60).join(", "),
  ].join("\n");

  let parsed: { completedTasks?: string[]; phaseComplete?: boolean; suggestions?: string[] };
  try {
    parsed = extractJsonObject(await complete(provider, ADVANCE_SYSTEM, user, "suggest", routing)) as typeof parsed;
  } catch {
    return { brain, suggestions: [] };
  }

  const completed = new Set((parsed.completedTasks ?? []).map((t) => t.trim().toLowerCase()));
  const phases = brain.phases.map((p) => {
    if (p.id !== active.id) return p;
    const tasks = p.tasks.map((t) =>
      t.done || completed.has(t.text.trim().toLowerCase()) ? { ...t, done: true } : t
    );
    return { ...p, tasks };
  });

  // A phase is done when every task is, or when the model says so.
  const idx = phases.findIndex((p) => p.id === active.id);
  const updatedActive = phases[idx]!;
  const allDone =
    updatedActive.tasks.length > 0 && updatedActive.tasks.every((t) => t.done);
  let currentPhase = brain.currentPhase;

  if (allDone || parsed.phaseComplete === true) {
    phases[idx] = { ...updatedActive, status: "done" };
    const next = phases[idx + 1];
    if (next) {
      phases[idx + 1] = { ...next, status: "active" };
      currentPhase = next.id;
    }
  }

  return {
    brain: { ...brain, phases, currentPhase, updatedAt: new Date().toISOString() },
    suggestions: (parsed.suggestions ?? []).slice(0, 5).map(String).filter(Boolean),
  };
}

// Re-exported so routes can parse a phase list the user typed in bulk.
export { extractJsonArray };
