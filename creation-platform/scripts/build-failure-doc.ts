// Generates docs/failure-catalogue.md from src/failures.ts.
//
// The doc is generated rather than written so it cannot drift from
// the behaviour. A test asserts the file on disk matches this output,
// so adding a failure mode without regenerating fails the suite.
//
//   npx tsx scripts/build-failure-doc.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAILURES, type FailureArea, type FailureMode } from "../src/failures.js";

const AREAS: Array<[FailureArea, string, string]> = [
  ["preview", "Preview failures", "The generated app is built and served, but does not come up. These are what the blank frame actually means."],
  ["generation", "Generation failures", "The model's output never arrived, or arrived unusable."],
  ["platform", "Platform failures", "Our own server, storage or deploy path."],
  ["partial", "Partial failures", "Something half-worked. The dangerous category — the run reports success and something is quietly missing."],
];

const BADGE: Record<FailureMode["status"], string> = {
  handled: "**Handled**",
  detected: "**Detected**",
  open: "**Open**",
};

function row(f: FailureMode): string {
  const lines = [
    `#### ${f.title}`,
    "",
    `${BADGE[f.status]}${f.autoFixable ? " · fixed automatically" : ""} · \`${f.id}\``,
    "",
    `**Cause.** ${f.cause}`,
    "",
    `**Fix.** ${f.fix}`,
  ];
  if (f.signature) {
    lines.push("", `**Recognised by.** \`${f.signature.source}\``);
  } else {
    lines.push("", "**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.");
  }
  return lines.join("\n");
}

export function buildDoc(): string {
  const counts = {
    handled: FAILURES.filter((f) => f.status === "handled").length,
    detected: FAILURES.filter((f) => f.status === "detected").length,
    open: FAILURES.filter((f) => f.status === "open").length,
  };

  const out: string[] = [
    "# Failure catalogue",
    "",
    "<!-- GENERATED FROM src/failures.ts — do not edit by hand.",
    "     Run: npx tsx scripts/build-failure-doc.ts -->",
    "",
    '"It did not render a preview" is not one bug. It is roughly thirty,',
    "and from the outside every one of them looks identical: a blank",
    "frame. This is the list, so each can be recognised on sight instead",
    "of diagnosed from scratch every time.",
    "",
    "Every entry has a status:",
    "",
    "- **Handled** — prevented, repaired, or made impossible by construction.",
    "- **Detected** — recognised and explained, but someone still has to act.",
    "- **Open** — known and written down. Nothing stops it yet. **This is the work queue.**",
    "",
    `Currently: **${counts.handled} handled**, **${counts.detected} detected**, **${counts.open} open** — ${FAILURES.length} total.`,
    "",
  ];

  const open = FAILURES.filter((f) => f.status === "open");
  if (open.length) {
    out.push("## Still open", "", "The ones worth fixing next:", "");
    for (const f of open) out.push(`- **${f.title}** — ${f.cause.split(".")[0]}. \`${f.id}\``);
    out.push("");
  }

  for (const [area, heading, blurb] of AREAS) {
    const items = FAILURES.filter((f) => f.area === area);
    if (!items.length) continue;
    out.push(`## ${heading}`, "", blurb, "");
    for (const f of items) out.push(row(f), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOC_PATH = path.join(__dirname, "..", "docs", "failure-catalogue.md");

// Only write when run directly, so the test can import buildDoc()
// without the import having a side effect on the repo.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
  fs.writeFileSync(DOC_PATH, buildDoc());
  console.log(`Wrote ${DOC_PATH} — ${FAILURES.length} failure modes.`);
}
