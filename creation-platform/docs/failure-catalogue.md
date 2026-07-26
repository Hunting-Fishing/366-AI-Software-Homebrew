# Failure catalogue

<!-- GENERATED FROM src/failures.ts — do not edit by hand.
     Run: npx tsx scripts/build-failure-doc.ts -->

"It did not render a preview" is not one bug. It is roughly thirty,
and from the outside every one of them looks identical: a blank
frame. This is the list, so each can be recognised on sight instead
of diagnosed from scratch every time.

Every entry has a status:

- **Handled** — prevented, repaired, or made impossible by construction.
- **Detected** — recognised and explained, but someone still has to act.
- **Open** — known and written down. Nothing stops it yet. **This is the work queue.**

Currently: **13 handled**, **23 detected**, **6 open** — 42 total.

## Still open

The ones worth fixing next:

- **An image or asset is missing** — The code references a file that is not part of the project. `asset-404`
- **The app renders but is completely unstyled** — Tailwind is loaded from a CDN at runtime. `tailwind-cdn-down`
- **No package.json, so no packages resolve** — The import map is built from package. `missing-package-json`
- **A package was declared that does not exist** — A plausible-sounding but non-existent package name, or a version that was never published. `phantom-dependency`
- **The project no longer fits in one request** — Every edit sends the whole project. `context-exceeded`
- **The preview shows the previous build** — A build finished but the preview was not reloaded, so the frame shows older code. `stale-preview`

## Preview failures

The generated app is built and served, but does not come up. These are what the blank frame actually means.

#### A file imports something its source never exports

**Detected** · `missing-export`

**Cause.** The model wrote `import { IconUtensils } from './icons.jsx'` and then either named the export differently, forgot to export it, or used a default export. Browsers resolve ES modules statically, so this throws before a single line runs — the frame stays blank.

**Fix.** Open the module named in the error and add the missing named export, or correct the import to the name that is actually exported. Check every other symbol imported from that same file while you are there — where one is missing, others usually are too.

**Recognised by.** `does not provide an export named|has no exported member`

#### A package was imported but is not in the import map

**Detected** · `unresolved-specifier`

**Cause.** There is no node_modules here. Bare imports resolve through an import map built from package.json dependencies, and an import map has no wildcard — every package name must be listed. A package imported but never declared resolves to nothing.

**Fix.** Add the package to `dependencies` in package.json with an exact version, or remove the import and use something already declared. Do not invent package names.

**Recognised by.** `Failed to resolve module specifier|Relative references must start with`

#### A package could not be downloaded

**Detected** · `module-fetch-failed`

**Cause.** Packages come from esm.sh at runtime. A version that does not exist, a package that was never published, or esm.sh being slow or unreachable all land here. It is a network failure, not a code failure.

**Fix.** Check the package name and version in package.json are both real. Prefer a widely used package at a known-good version over an obscure one.

**Recognised by.** `Failed to fetch dynamically imported module|error loading dynamically imported`

#### Two copies of React are loaded

**Handled** · `invalid-hook-call`

**Cause.** A library that bundles its own React gives you two React instances, and hooks from one do not work inside the other. The import map pins every third-party package with ?deps=react@<ours>, which is what prevents it — an entry that slipped past that pinning brings it back.

**Fix.** Every esm.sh URL for a package that renders React must carry ?deps=react@18.3.1,react-dom@18.3.1.

**Recognised by.** `Invalid hook call|Cannot read propert.*of null.*useState`

#### A stylesheet was imported as if it were JavaScript

**Handled** · `css-module-import`

**Cause.** `import './styles.css'` is a bundler convention, not a browser one. Plain .css imports are stripped and re-injected as <link> tags; .scss, .sass, .less and .styl are not, because nothing here can compile them.

**Fix.** Use plain CSS or Tailwind utility classes. Never .scss, .sass, .less or .styl — there is no compiler in this environment.

**Recognised by.** `Expected a JavaScript(?:-or-Wasm)? module|not a valid JavaScript MIME type`

#### TypeScript syntax in a file served as JavaScript

**Detected** · `typescript-in-jsx`

**Cause.** Type annotations in a .jsx file. The transpiler is told to treat .jsx as JavaScript, so `const x: string` is a syntax error rather than a type.

**Fix.** Either drop the type annotations, or rename the file to .tsx and update every import that refers to it.

**Recognised by.** `Unexpected token.*[:<]|Missing semicolon`

#### The app mounted to an element that does not exist

**Handled** · fixed automatically · `no-mount-node`

**Cause.** The entry called getElementById on an id the page does not have. The served page declares the mount div, so an entry expecting a different id finds null.

**Fix.** Mount to the element the page actually provides. Read the id from index.html rather than assuming one.

**Recognised by.** `Target container is not a DOM element|createRoot.*null`

#### The app loaded but drew nothing

**Detected** · `nothing-rendered`

**Cause.** No error was thrown and the mount node is still empty. Usually the root component returns null or undefined, or the entry never calls render at all. Note this is a verdict of last resort — it is only reported once the module graph has finished loading, because a slow package download looks identical from the outside.

**Fix.** Check the entry actually calls createRoot(...).render(<App />), that App is the default export, and that App returns markup on every path — including its loading and empty states.

**Recognised by.** `Nothing rendered`

#### The app re-renders forever

**Detected** · `render-loop`

**Cause.** setState is being called during render, or inside an effect whose dependency array contains a value that effect changes. The tab pins a CPU core and the frame freezes.

**Fix.** Find the setState reached during render or in an effect that depends on what it sets. Give the effect a correct dependency array, or move the update into an event handler.

**Recognised by.** `Maximum update depth exceeded|Too many re-renders`

#### Hooks called in a different order between renders

**Detected** · `conditional-hooks`

**Cause.** A hook inside an if, a loop, or after an early return. React matches hooks positionally, so a changing count corrupts the mapping.

**Fix.** Move every hook to the top level of the component, before any conditional or early return.

**Recognised by.** `Rendered (?:more|fewer) hooks|change in the order of Hooks`

#### The code read a field of something that was not there yet

**Detected** · `undefined-property`

**Cause.** Almost always data shape: mapping over an array that has not arrived yet, or reading a nested field the seed data does not have. Frequently the first render, before any state is populated.

**Fix.** Give every piece of state a correct initial value of the right type — [] for lists, not undefined. Guard nested reads with optional chaining. Make sure the demo data matches the shape the components expect.

**Recognised by.** `Cannot read propert(?:y|ies) of (?:undefined|null)`

#### An object was rendered where text was expected

**Detected** · `object-as-child`

**Cause.** {someObject} in JSX instead of a field of it. Common when a record is rendered directly rather than one of its properties, or when a Date lands in markup.

**Fix.** Render a specific field, or format the value to a string first.

**Recognised by.** `Objects are not valid as a React child`

#### A name was used but never imported

**Detected** · `not-defined`

**Cause.** A component or helper used without its import — usually after code was moved between files.

**Fix.** Add the missing import, or define the symbol. Check every file that references it.

**Recognised by.** `\b(?!process\b|require\b|__dirname\b|Buffer\b|module\b|exports\b)(\w+) is not defined`

#### Node.js APIs used in browser code

**Detected** · `node-globals`

**Cause.** `process.env`, `require()` or `Buffer` in code that runs in a browser. There is no bundler here to shim them.

**Fix.** Use browser APIs only. No require — use ES import. No process.env — put configuration in a plain exported constant.

**Recognised by.** `(?:process|require|__dirname|Buffer|module) is not defined`

#### Saving to browser storage was blocked

**Handled** · fixed automatically · `storage-blocked`

**Cause.** The preview runs in a sandboxed iframe with an opaque origin, and localStorage throws rather than returning null there. The sandbox is deliberate — this frame runs AI-generated code and must not reach the platform around it. A shim provides a working in-memory localStorage instead, so the app behaves normally; real persistence returns once the app is deployed to its own origin.

**Fix.** Use localStorage normally. It works in preview via a shim and for real once deployed. Never assume a value survives a preview reload.

**Recognised by.** `(?:localStorage|sessionStorage).*(?:SecurityError|denied|not available)|Access is denied for this document`

#### The app tried to call a server that does not exist

**Detected** · `network-call`

**Cause.** Generated apps have no backend. A fetch to /api/... or to a third-party service fails, and if that fetch is in a retry loop it fails continuously.

**Fix.** Do not call a backend. Keep state in React and persist to localStorage. If an API is genuinely needed, say so rather than writing a fetch to an endpoint that was never built.

**Recognised by.** `Failed to fetch|NetworkError when attempting|ERR_CONNECTION`

#### An image or asset is missing

**Open** · `asset-404`

**Cause.** The code references a file that is not part of the project. Generated art is stored separately from the source files and is not served to the preview.

**Fix.** Do not reference image files that were not created. Use inline SVG, a CSS gradient, or a coloured block with initials.

**Recognised by.** `404.*(?:png|jpg|jpeg|svg|gif|webp|woff2?)`

#### The app renders but is completely unstyled

**Open** · `tailwind-cdn-down`

**Cause.** Tailwind is loaded from a CDN at runtime. If that request fails, every utility class becomes a no-op and the page appears as raw unstyled HTML — no error, just an ugly page.

**Fix.** Reload. If it persists the CDN is unreachable from this network.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.

## Generation failures

The model's output never arrived, or arrived unusable.

#### The model ran out of room mid-file

**Detected** · `truncated-output`

**Cause.** The response hit the output token ceiling, so the last file stops mid-expression. The result parses as a file but is not valid code.

**Fix.** Ask for the truncated file again on its own, or split the request into smaller steps.

**Recognised by.** `Unexpected end of input|Unterminated (?:string|template|comment)|Unexpected end of JSON`

#### The reply contained no code

**Detected** · `no-files-parsed`

**Cause.** The model answered in prose — asked a question, refused, or explained instead of building. Nothing matched the file-block format, so there is nothing to save.

**Fix.** Restate the request as a concrete instruction. If the model asked a question, answer it.

**Recognised by.** `no files|could not parse|nothing to write`

#### No package.json, so no packages resolve

**Open** · `missing-package-json`

**Cause.** The import map is built from package.json. Without it only React resolves, and any other import fails at load.

**Fix.** Always emit package.json listing every package imported anywhere in the project.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.

#### A package was declared that does not exist

**Open** · `phantom-dependency`

**Cause.** A plausible-sounding but non-existent package name, or a version that was never published. Fails at fetch time, in the browser, as a network error rather than anything obviously about the package.

**Fix.** Only use packages you are certain exist, at versions you are certain were published.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.

#### The AI provider rejected the API key

**Detected** · `provider-auth`

**Cause.** The key is wrong, revoked, or missing from the environment.

**Fix.** Check the key in the environment settings, then restart the server.

**Recognised by.** `401|invalid.*api.?key|authentication_error|unauthorized`

#### The AI provider is rate limiting

**Detected** · `provider-rate-limit`

**Cause.** Too many requests in a short window, or the account's tier limit was reached.

**Fix.** Wait a moment and retry. Repeated hits mean the account needs a higher limit.

**Recognised by.** `429|rate.?limit|too many requests`

#### The AI provider is overloaded

**Detected** · `provider-overloaded`

**Cause.** Provider-side capacity. Nothing about this project caused it.

**Fix.** Retry. If it persists, switch provider in the header.

**Recognised by.** `529|overloaded|service unavailable|503`

#### The project no longer fits in one request

**Open** · `context-exceeded`

**Cause.** Every edit sends the whole project. Past a certain size that exceeds the model's input limit, and every further edit fails the same way.

**Fix.** Split the app, or ask for changes to specific named files rather than the whole project.

**Recognised by.** `context.*(?:length|window)|too many tokens|prompt is too long`

#### The provider account is out of credit

**Detected** · `no-credit`

**Cause.** The provider account has no remaining balance, so every request is refused before the model is reached. Distinct from a rate limit: waiting does not help, and it fails identically on the first request and the hundredth.

**Fix.** Top up the account, or switch to another provider in the header.

**Recognised by.** `credit balance|insufficient.*(?:quota|funds|credit)|billing`

#### A correction came back missing files, and replaced the good version

**Handled** · fixed automatically · `correction-dropped-files`

**Cause.** Edits re-send the whole project and ask for the whole project back, so any file the model leaves out is deleted. The auto-fix pass then accepted that reply on one condition — that it contained at least one file — and never re-checked it. A truncated correction therefore replaced a working project with a broken one, and the build still reported success. RestoBar Manager lost src/App.jsx this way at version 11 and was built on for five more rounds before anyone noticed.

**Fix.** Output the COMPLETE project on every edit — every file, including the ones you did not touch. A file you omit is deleted.

**Recognised by.** `dropped \d+ file|files? (?:are )?missing and must exist`

#### A file imports another file that is not in the project

**Handled** · `import-of-missing-file`

**Cause.** The classic symptom of a partial write: the entry imports ./App.jsx and nothing ever created it. The module graph stops at the missing file, so nothing runs and the frame stays blank — with only a 404 in the console to say why.

**Fix.** Create the missing file, or remove the import. Check the whole project for other imports pointing at files that were never written.

**Recognised by.** `Imports files that do not exist|404.*\.(?:jsx?|tsx?)\b`

## Platform failures

Our own server, storage or deploy path.

#### The preview frame could reach the platform around it

**Handled** · fixed automatically · `sandbox-escape`

**Cause.** The preview iframe was given allow-same-origin alongside allow-scripts, and /live is served from the platform's own origin — so generated code could read parent.document, the session cookie, and call the API as the signed-in user. It was granted to make localStorage work; the storage shim does that without opening the hole.

**Fix.** The preview frame must never carry allow-same-origin.

**Recognised by.** `allow-scripts and allow-same-origin|can escape its sandboxing`

#### Two saves collided

**Handled** · fixed automatically · `version-collision`

**Cause.** Version numbers come from reading the current maximum and adding one. Two saves in flight read the same number. The unique constraint catches it and the loser retries.

**Fix.** Nothing to do — it retries. Repeated occurrences mean saves are firing too often.

**Recognised by.** `23505|duplicate key|unique_version`

#### Signed out mid-build

**Detected** · `session-expired`

**Cause.** The session lapsed while a build was running. The code is on screen but the save is refused, so the work exists only in the tab.

**Fix.** Download the ZIP before signing back in — a reload loses whatever was not saved.

**Recognised by.** `401|not signed in|session.*expired`

#### The database could not be reached

**Detected** · `storage-unreachable`

**Cause.** Network, a paused project, or wrong credentials.

**Fix.** Builds still work and can be downloaded; saving is what fails. Check the database is running.

**Recognised by.** `Supabase.*failed|ECONNREFUSED|ENOTFOUND|fetch failed`

#### The preview ran out of memory

**Handled** · `preview-oom`

**Cause.** A subprocess exceeded the container's memory. React previews no longer install anything so they cannot cause this; Python previews still spawn a real process.

**Fix.** Retry. Persistent failures on a Python project mean it needs too much memory for this instance.

**Recognised by.** `out of memory|ENOMEM|502|Killed`

#### Publishing is switched off

**Detected** · `publish-not-configured`

**Cause.** No deploy token in the environment, so the Publish button has nothing to talk to.

**Fix.** Add a deploy token to the environment and restart.

**Recognised by.** `NETLIFY_TOKEN|publish.*not configured`

#### The Python app would not start

**Detected** · `flask-boot-failure`

**Cause.** A missing app.py, an import of a package that is not installed, or a syntax error.

**Fix.** Check the traceback's last line, fix that file, and rebuild.

**Recognised by.** `No module named|Traceback \(most recent call last\)|app\.py`

#### The preview could not load its own files

**Handled** · fixed automatically · `preview-blocked-cross-origin`

**Cause.** The preview frame is sandboxed without allow-same-origin so that generated code cannot reach the platform. That gives it an opaque origin ('null'), which sends no cookies and makes every request to /live a cross-origin one — so cookie auth returned 401 and the browser blocked the module fetch. Tightening the sandbox and keeping cookie auth are mutually exclusive; the resolution is a per-run token in the path (/live/<token>/) which is the credential instead, letting the route be public and CORS-open while the sandbox stays shut.

**Fix.** Nothing to do — the preview URL carries its own token. If this appears, the token was stale: rebuild, which issues a new one.

**Recognised by.** `blocked by CORS policy|from origin 'null'|ERR_FAILED 401`

## Partial failures

Something half-worked. The dangerous category — the run reports success and something is quietly missing.

#### The build worked but the save did not

**Handled** · `built-not-saved`

**Cause.** Saving is deliberately non-blocking so a storage hiccup cannot cost a build. The consequence is that the code exists only in the tab until the next successful save.

**Fix.** The Save button reports this. Press it again, or download the ZIP.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.

#### The build worked but the plan did not advance

**Handled** · `plan-not-updated`

**Cause.** Planning is best effort — a failure there must never look like a failed build. The visible symptom is missing next-step suggestions.

**Fix.** The next build re-plans automatically.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.

#### Some generated images failed

**Handled** · `partial-assets`

**Cause.** Images are generated one per request. Some succeed, some are refused or time out, and the run continues with whatever arrived.

**Fix.** The count says how many. Re-run to fill the gaps — existing images are kept.

**Recognised by.** `\d+\/\d+ (?:sprites|pages)`

#### The preview shows the previous build

**Open** · `stale-preview`

**Cause.** A build finished but the preview was not reloaded, so the frame shows older code. Silent and genuinely misleading — the app looks like it ignored the last instruction.

**Fix.** Press the reload button above the preview.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.

#### The app renders but every list is empty

**Detected** · `silent-empty-state`

**Cause.** Demo data is off, or the seed data does not match the shape the components read. Nothing errors — the app simply looks like it does nothing.

**Fix.** Check the Demo data switch above the preview. If it is on and lists are still empty, the seed records do not match the fields the components use.

**Recognised by.** Nothing — this one has no error message, which is why it is hard to spot.
