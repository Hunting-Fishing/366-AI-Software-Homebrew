// The failure catalogue.
//
// WHY THIS EXISTS
// "It did not render a preview" is not one bug, it is about thirty,
// and they look identical from the outside: a blank frame. Every one
// of them was previously diagnosed by hand, from scratch, each time.
//
// So each known way this platform can fail gets an entry here: how to
// recognise it, what actually causes it, and what to do. Three things
// fall out of that:
//
//   1. The toast can name the real problem instead of echoing a raw
//      stack trace at someone who did not write the code.
//   2. The Fix button can send a prompt aimed at the actual cause.
//   3. `status` turns this file into the work queue — everything
//      marked "open" is a known way to lose a build that nothing yet
//      prevents.
//
// docs/failure-catalogue.md is generated from this file, so the
// written list can never drift from the behaviour.

export type FailureArea =
  /** In the browser, after the code was generated and served. */
  | "preview"
  /** The model's output was unusable or never arrived. */
  | "generation"
  /** Our own server, storage or deploy path. */
  | "platform"
  /** Something half-worked — the worst kind, because it looks fine. */
  | "partial";

export type FailureStatus =
  /** Prevented, repaired, or made impossible by construction. */
  | "handled"
  /** We recognise it and explain it, but the user still has to act. */
  | "detected"
  /** Known and catalogued. Nothing stops it yet. This is the queue. */
  | "open";

export interface FailureMode {
  id: string;
  area: FailureArea;
  /** Plain language. This is what appears in the toast. */
  title: string;
  /** Matches the raw error text. Null when it has no message to match. */
  signature: RegExp | null;
  /** The mechanism. Written for someone debugging it at 1am. */
  cause: string;
  /**
   * What to do. For "preview" entries this is appended to the Fix
   * prompt, so it is addressed to the agent, not to the reader.
   */
  fix: string;
  status: FailureStatus;
  /** Fixable by the platform alone, with no model call. */
  autoFixable?: boolean;
}

export const FAILURES: FailureMode[] = [
  // ── Preview: module graph ────────────────────────────────
  {
    id: "missing-export",
    area: "preview",
    title: "A file imports something its source never exports",
    signature: /does not provide an export named|has no exported member/i,
    cause:
      "The model wrote `import { IconUtensils } from './icons.jsx'` and then either named the export differently, forgot to export it, or used a default export. Browsers resolve ES modules statically, so this throws before a single line runs — the frame stays blank.",
    fix: "Open the module named in the error and add the missing named export, or correct the import to the name that is actually exported. Check every other symbol imported from that same file while you are there — where one is missing, others usually are too.",
    status: "detected",
  },
  {
    id: "unresolved-specifier",
    area: "preview",
    title: "A package was imported but is not in the import map",
    signature: /Failed to resolve module specifier|Relative references must start with/i,
    cause:
      "There is no node_modules here. Bare imports resolve through an import map built from package.json dependencies, and an import map has no wildcard — every package name must be listed. A package imported but never declared resolves to nothing.",
    fix: "Add the package to `dependencies` in package.json with an exact version, or remove the import and use something already declared. Do not invent package names.",
    status: "detected",
  },
  {
    id: "module-fetch-failed",
    area: "preview",
    title: "A package could not be downloaded",
    signature: /Failed to fetch dynamically imported module|error loading dynamically imported/i,
    cause:
      "Packages come from esm.sh at runtime. A version that does not exist, a package that was never published, or esm.sh being slow or unreachable all land here. It is a network failure, not a code failure.",
    fix: "Check the package name and version in package.json are both real. Prefer a widely used package at a known-good version over an obscure one.",
    status: "detected",
  },
  {
    id: "invalid-hook-call",
    area: "preview",
    title: "Two copies of React are loaded",
    signature: /Invalid hook call|Cannot read propert.*of null.*useState/i,
    cause:
      "A library that bundles its own React gives you two React instances, and hooks from one do not work inside the other. The import map pins every third-party package with ?deps=react@<ours>, which is what prevents it — an entry that slipped past that pinning brings it back.",
    fix: "Every esm.sh URL for a package that renders React must carry ?deps=react@18.3.1,react-dom@18.3.1.",
    status: "handled",
  },
  {
    id: "css-module-import",
    area: "preview",
    title: "A stylesheet was imported as if it were JavaScript",
    signature: /Expected a JavaScript(?:-or-Wasm)? module|not a valid JavaScript MIME type/i,
    cause:
      "`import './styles.css'` is a bundler convention, not a browser one. Plain .css imports are stripped and re-injected as <link> tags; .scss, .sass, .less and .styl are not, because nothing here can compile them.",
    fix: "Use plain CSS or Tailwind utility classes. Never .scss, .sass, .less or .styl — there is no compiler in this environment.",
    status: "handled",
  },
  {
    id: "typescript-in-jsx",
    area: "preview",
    title: "TypeScript syntax in a file served as JavaScript",
    signature: /Unexpected token.*[:<]|Missing semicolon/i,
    cause:
      "Type annotations in a .jsx file. The transpiler is told to treat .jsx as JavaScript, so `const x: string` is a syntax error rather than a type.",
    fix: "Either drop the type annotations, or rename the file to .tsx and update every import that refers to it.",
    status: "detected",
  },

  // ── Preview: render ──────────────────────────────────────
  {
    id: "no-mount-node",
    area: "preview",
    title: "The app mounted to an element that does not exist",
    signature: /Target container is not a DOM element|createRoot.*null/i,
    cause:
      "The entry called getElementById on an id the page does not have. The served page declares the mount div, so an entry expecting a different id finds null.",
    fix: "Mount to the element the page actually provides. Read the id from index.html rather than assuming one.",
    status: "handled",
    autoFixable: true,
  },
  {
    id: "nothing-rendered",
    area: "preview",
    title: "The app loaded but drew nothing",
    signature: /Nothing rendered/i,
    cause:
      "No error was thrown and the mount node is still empty. Usually the root component returns null or undefined, or the entry never calls render at all. Note this is a verdict of last resort — it is only reported once the module graph has finished loading, because a slow package download looks identical from the outside.",
    fix: "Check the entry actually calls createRoot(...).render(<App />), that App is the default export, and that App returns markup on every path — including its loading and empty states.",
    status: "detected",
  },
  {
    id: "render-loop",
    area: "preview",
    title: "The app re-renders forever",
    signature: /Maximum update depth exceeded|Too many re-renders/i,
    cause:
      "setState is being called during render, or inside an effect whose dependency array contains a value that effect changes. The tab pins a CPU core and the frame freezes.",
    fix: "Find the setState reached during render or in an effect that depends on what it sets. Give the effect a correct dependency array, or move the update into an event handler.",
    status: "detected",
  },
  {
    id: "conditional-hooks",
    area: "preview",
    title: "Hooks called in a different order between renders",
    signature: /Rendered (?:more|fewer) hooks|change in the order of Hooks/i,
    cause:
      "A hook inside an if, a loop, or after an early return. React matches hooks positionally, so a changing count corrupts the mapping.",
    fix: "Move every hook to the top level of the component, before any conditional or early return.",
    status: "detected",
  },
  {
    id: "undefined-property",
    area: "preview",
    title: "The code read a field of something that was not there yet",
    signature: /Cannot read propert(?:y|ies) of (?:undefined|null)/i,
    cause:
      "Almost always data shape: mapping over an array that has not arrived yet, or reading a nested field the seed data does not have. Frequently the first render, before any state is populated.",
    fix: "Give every piece of state a correct initial value of the right type — [] for lists, not undefined. Guard nested reads with optional chaining. Make sure the demo data matches the shape the components expect.",
    status: "detected",
  },
  {
    id: "object-as-child",
    area: "preview",
    title: "An object was rendered where text was expected",
    signature: /Objects are not valid as a React child/i,
    cause:
      "{someObject} in JSX instead of a field of it. Common when a record is rendered directly rather than one of its properties, or when a Date lands in markup.",
    fix: "Render a specific field, or format the value to a string first.",
    status: "detected",
  },
  {
    id: "not-defined",
    area: "preview",
    title: "A name was used but never imported",
    // The Node globals are excluded by name rather than by a trailing
    // lookahead: "process is not defined" has nothing after it to look
    // ahead at, so the lookahead passed and this entry swallowed the
    // node-globals case.
    signature: /\b(?!process\b|require\b|__dirname\b|Buffer\b|module\b|exports\b)(\w+) is not defined/i,
    cause: "A component or helper used without its import — usually after code was moved between files.",
    fix: "Add the missing import, or define the symbol. Check every file that references it.",
    status: "detected",
  },
  {
    id: "node-globals",
    area: "preview",
    title: "Node.js APIs used in browser code",
    signature: /(?:process|require|__dirname|Buffer|module) is not defined/i,
    cause:
      "`process.env`, `require()` or `Buffer` in code that runs in a browser. There is no bundler here to shim them.",
    fix: "Use browser APIs only. No require — use ES import. No process.env — put configuration in a plain exported constant.",
    status: "detected",
  },

  // ── Preview: environment ─────────────────────────────────
  {
    id: "storage-blocked",
    area: "preview",
    title: "Saving to browser storage was blocked",
    signature: /(?:localStorage|sessionStorage).*(?:SecurityError|denied|not available)|Access is denied for this document/i,
    cause:
      "The preview runs in a sandboxed iframe with an opaque origin, and localStorage throws rather than returning null there. The sandbox is deliberate — this frame runs AI-generated code and must not reach the platform around it. A shim provides a working in-memory localStorage instead, so the app behaves normally; real persistence returns once the app is deployed to its own origin.",
    fix: "Use localStorage normally. It works in preview via a shim and for real once deployed. Never assume a value survives a preview reload.",
    status: "handled",
    autoFixable: true,
  },
  {
    id: "network-call",
    area: "preview",
    title: "The app tried to call a server that does not exist",
    signature: /Failed to fetch|NetworkError when attempting|ERR_CONNECTION/i,
    cause:
      "Generated apps have no backend. A fetch to /api/... or to a third-party service fails, and if that fetch is in a retry loop it fails continuously.",
    fix: "Do not call a backend. Keep state in React and persist to localStorage. If an API is genuinely needed, say so rather than writing a fetch to an endpoint that was never built.",
    status: "detected",
  },
  {
    id: "asset-404",
    area: "preview",
    title: "An image or asset is missing",
    signature: /404.*(?:png|jpg|jpeg|svg|gif|webp|woff2?)/i,
    cause:
      "The code references a file that is not part of the project. Generated art is stored separately from the source files and is not served to the preview.",
    fix: "Do not reference image files that were not created. Use inline SVG, a CSS gradient, or a coloured block with initials.",
    status: "open",
  },
  {
    id: "tailwind-cdn-down",
    area: "preview",
    title: "The app renders but is completely unstyled",
    signature: null,
    cause:
      "Tailwind is loaded from a CDN at runtime. If that request fails, every utility class becomes a no-op and the page appears as raw unstyled HTML — no error, just an ugly page.",
    fix: "Reload. If it persists the CDN is unreachable from this network.",
    status: "open",
  },

  // ── Generation ───────────────────────────────────────────
  {
    id: "truncated-output",
    area: "generation",
    title: "The model ran out of room mid-file",
    signature: /Unexpected end of input|Unterminated (?:string|template|comment)|Unexpected end of JSON/i,
    cause:
      "The response hit the output token ceiling, so the last file stops mid-expression. The result parses as a file but is not valid code.",
    fix: "Ask for the truncated file again on its own, or split the request into smaller steps.",
    status: "detected",
  },
  {
    id: "no-files-parsed",
    area: "generation",
    title: "The reply contained no code",
    signature: /no files|could not parse|nothing to write/i,
    cause:
      "The model answered in prose — asked a question, refused, or explained instead of building. Nothing matched the file-block format, so there is nothing to save.",
    fix: "Restate the request as a concrete instruction. If the model asked a question, answer it.",
    status: "detected",
  },
  {
    id: "missing-package-json",
    area: "generation",
    title: "No package.json, so no packages resolve",
    signature: null,
    cause:
      "The import map is built from package.json. Without it only React resolves, and any other import fails at load.",
    fix: "Always emit package.json listing every package imported anywhere in the project.",
    status: "open",
  },
  {
    id: "phantom-dependency",
    area: "generation",
    title: "A package was declared that does not exist",
    signature: /is not an available package|packages are not available/i,
    cause:
      "A plausible-sounding but non-existent package name, or a version that was never published — the model supplied both from memory. It used to fail at fetch time in the browser, as a network error rather than anything obviously about the package. Generation is now constrained to the pinned catalogue in src/packages.ts, so an unlisted package is caught by checkProject before the code is ever served, and versions come from the catalogue rather than from package.json.",
    fix: "Use a package from the available list. Nothing else can be loaded.",
    status: "handled",
  },
  {
    id: "provider-auth",
    area: "generation",
    title: "The AI provider rejected the API key",
    signature: /401|invalid.*api.?key|authentication_error|unauthorized/i,
    cause: "The key is wrong, revoked, or missing from the environment.",
    fix: "Check the key in the environment settings, then restart the server.",
    status: "detected",
  },
  {
    id: "provider-rate-limit",
    area: "generation",
    title: "The AI provider is rate limiting",
    signature: /429|rate.?limit|too many requests/i,
    cause: "Too many requests in a short window, or the account's tier limit was reached.",
    fix: "Wait a moment and retry. Repeated hits mean the account needs a higher limit.",
    status: "detected",
  },
  {
    id: "provider-overloaded",
    area: "generation",
    title: "The AI provider is overloaded",
    signature: /529|overloaded|service unavailable|503/i,
    cause: "Provider-side capacity. Nothing about this project caused it.",
    fix: "Retry. If it persists, switch provider in the header.",
    status: "detected",
  },
  {
    id: "context-exceeded",
    area: "generation",
    title: "The project no longer fits in one request",
    signature: /context.*(?:length|window)|too many tokens|prompt is too long/i,
    cause:
      "Every edit sends the whole project. Past a certain size that exceeds the model's input limit, and every further edit fails the same way.",
    fix: "Split the app, or ask for changes to specific named files rather than the whole project.",
    status: "open",
  },
  {
    id: "no-credit",
    area: "generation",
    title: "The provider account is out of credit",
    signature: /credit balance|insufficient.*(?:quota|funds|credit)|billing/i,
    cause:
      "The provider account has no remaining balance, so every request is refused before the model is reached. Distinct from a rate limit: waiting does not help, and it fails identically on the first request and the hundredth.",
    fix: "Top up the account, or switch to another provider in the header.",
    status: "detected",
  },

  {
    id: "correction-dropped-files",
    area: "generation",
    title: "A correction came back missing files, and replaced the good version",
    signature: /dropped \d+ file|files? (?:are )?missing and must exist/i,
    cause:
      "Edits re-send the whole project and ask for the whole project back, so any file the model leaves out is deleted. The auto-fix pass then accepted that reply on one condition — that it contained at least one file — and never re-checked it. A truncated correction therefore replaced a working project with a broken one, and the build still reported success. RestoBar Manager lost src/App.jsx this way at version 11 and was built on for five more rounds before anyone noticed.",
    fix: "Output the COMPLETE project on every edit — every file, including the ones you did not touch. A file you omit is deleted.",
    status: "handled",
    autoFixable: true,
  },
  {
    id: "import-of-missing-file",
    area: "generation",
    title: "A file imports another file that is not in the project",
    signature: /Imports files that do not exist|Missing file: [^\s]+ — it is imported/i,
    cause:
      "The classic symptom of a partial write: the entry imports ./App.jsx and nothing ever created it. The module graph stops at the missing file, so nothing runs and the frame stays blank — with only a 404 in the console to say why.",
    fix: "Create the missing file, or remove the import. Check the whole project for other imports pointing at files that were never written.",
    status: "handled",
  },
  {
    id: "sandbox-escape",
    area: "platform",
    title: "The preview frame could reach the platform around it",
    signature: /allow-scripts and allow-same-origin|can escape its sandboxing/i,
    cause:
      "The preview iframe was given allow-same-origin alongside allow-scripts, and /live is served from the platform's own origin — so generated code could read parent.document, the session cookie, and call the API as the signed-in user. It was granted to make localStorage work; the storage shim does that without opening the hole.",
    fix: "The preview frame must never carry allow-same-origin.",
    status: "handled",
    autoFixable: true,
  },

  // ── Platform ─────────────────────────────────────────────
  {
    id: "version-collision",
    area: "platform",
    title: "Two saves collided",
    signature: /23505|duplicate key|unique_version/i,
    cause:
      "Version numbers come from reading the current maximum and adding one. Two saves in flight read the same number. The unique constraint catches it and the loser retries.",
    fix: "Nothing to do — it retries. Repeated occurrences mean saves are firing too often.",
    status: "handled",
    autoFixable: true,
  },
  {
    id: "session-expired",
    area: "platform",
    title: "Signed out mid-build",
    signature: /401|not signed in|session.*expired/i,
    cause:
      "The session lapsed while a build was running. The code is on screen but the save is refused, so the work exists only in the tab.",
    fix: "Download the ZIP before signing back in — a reload loses whatever was not saved.",
    status: "detected",
  },
  {
    id: "storage-unreachable",
    area: "platform",
    title: "The database could not be reached",
    signature: /Supabase.*failed|ECONNREFUSED|ENOTFOUND|fetch failed/i,
    cause: "Network, a paused project, or wrong credentials.",
    fix: "Builds still work and can be downloaded; saving is what fails. Check the database is running.",
    status: "detected",
  },
  {
    id: "preview-oom",
    area: "platform",
    title: "The preview ran out of memory",
    signature: /out of memory|ENOMEM|502|Killed/i,
    cause:
      "A subprocess exceeded the container's memory. React previews no longer install anything so they cannot cause this; Python previews still spawn a real process.",
    fix: "Retry. Persistent failures on a Python project mean it needs too much memory for this instance.",
    status: "handled",
  },
  {
    id: "publish-not-configured",
    area: "platform",
    title: "Publishing is switched off",
    signature: /NETLIFY_TOKEN|publish.*not configured/i,
    cause: "No deploy token in the environment, so the Publish button has nothing to talk to.",
    fix: "Add a deploy token to the environment and restart.",
    status: "detected",
  },
  {
    id: "flask-boot-failure",
    area: "platform",
    title: "The Python app would not start",
    signature: /No module named|Traceback \(most recent call last\)|app\.py/i,
    cause: "A missing app.py, an import of a package that is not installed, or a syntax error.",
    fix: "Check the traceback's last line, fix that file, and rebuild.",
    status: "detected",
  },

  {
    id: "preview-blocked-cross-origin",
    area: "platform",
    title: "The preview could not load its own files",
    signature: /blocked by CORS policy|from origin 'null'|ERR_FAILED 401/i,
    cause:
      "The preview frame is sandboxed without allow-same-origin so that generated code cannot reach the platform. That gives it an opaque origin ('null'), which sends no cookies and makes every request to /live a cross-origin one — so cookie auth returned 401 and the browser blocked the module fetch. Tightening the sandbox and keeping cookie auth are mutually exclusive; the resolution is a per-run token in the path (/live/<token>/) which is the credential instead, letting the route be public and CORS-open while the sandbox stays shut.",
    fix: "Nothing to do — the preview URL carries its own token. If this appears, the token was stale: rebuild, which issues a new one.",
    status: "handled",
    autoFixable: true,
  },

  // ── Partial failures ─────────────────────────────────────
  // The dangerous category: the run reports success and something is
  // quietly missing.
  {
    id: "built-not-saved",
    area: "partial",
    title: "The build worked but the save did not",
    signature: null,
    cause:
      "Saving is deliberately non-blocking so a storage hiccup cannot cost a build. The consequence is that the code exists only in the tab until the next successful save.",
    fix: "The Save button reports this. Press it again, or download the ZIP.",
    status: "handled",
  },
  {
    id: "plan-not-updated",
    area: "partial",
    title: "The build worked but the plan did not advance",
    signature: null,
    cause:
      "Planning is best effort — a failure there must never look like a failed build. The visible symptom is missing next-step suggestions.",
    fix: "The next build re-plans automatically.",
    status: "handled",
  },
  {
    id: "partial-assets",
    area: "partial",
    title: "Some generated images failed",
    signature: /\d+\/\d+ (?:sprites|pages)/,
    cause:
      "Images are generated one per request. Some succeed, some are refused or time out, and the run continues with whatever arrived.",
    fix: "The count says how many. Re-run to fill the gaps — existing images are kept.",
    status: "handled",
  },
  {
    id: "stale-preview",
    area: "partial",
    title: "The preview shows the previous build",
    signature: null,
    cause:
      "A build finished but the preview was not reloaded, so the frame shows older code. Silent and genuinely misleading — the app looks like it ignored the last instruction.",
    fix: "Press the reload button above the preview.",
    status: "open",
  },
  {
    id: "silent-empty-state",
    area: "partial",
    title: "The app renders but every list is empty",
    signature: null,
    cause:
      "Demo data is off, or the seed data does not match the shape the components read. Nothing errors — the app simply looks like it does nothing.",
    fix: "Check the Demo data switch above the preview. If it is on and lists are still empty, the seed records do not match the fields the components use.",
    status: "detected",
  },
];

/**
 * Recognise a raw error message.
 *
 * Order matters: entries are listed most specific first, and the first
 * match wins. A generic "X is not defined" must not shadow the
 * Node-globals entry, which is why that one carries a lookahead.
 */
export function classify(message: string): FailureMode | null {
  if (!message) return null;
  for (const f of FAILURES) {
    if (f.signature && f.signature.test(message)) return f;
  }
  return null;
}

/** Everything still unaddressed — the work queue. */
export function openFailures(): FailureMode[] {
  return FAILURES.filter((f) => f.status === "open");
}

export function byArea(area: FailureArea): FailureMode[] {
  return FAILURES.filter((f) => f.area === area);
}
