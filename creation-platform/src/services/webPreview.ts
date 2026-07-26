// In-memory preview for React projects — no npm install, no subprocess.
//
// WHY THIS EXISTS
// The old path ran `npm install` then a Vite dev server inside the
// platform's own container. Installing React + Vite needs 300-500MB on
// top of the running server, which on a 512MB instance means the OOM
// killer takes the whole process down. Render restarts it and the user
// sees a 502. It also cost ~60 seconds every single time.
//
// Everything Vite was doing here can be done without it:
//
//   JSX → JS      the TypeScript compiler is already a dependency and
//                 transpiles JSX faster than a process can even spawn
//   react, etc.   an import map pointing at esm.sh, resolved by the
//                 browser — no node_modules at all
//   CSS imports   browsers cannot import CSS as a module, so those
//                 imports are stripped and injected as <link> instead
//
// Result: preview is ready in milliseconds, uses no extra memory, and
// cannot OOM. What is lost is hot-module reload and Vite plugins —
// neither of which a generated single-shot project uses.
//
// Which packages may be imported is decided by src/packages.ts, not by
// whatever the model happened to write in package.json. See the note
// there: a pinned catalogue turns "does this package exist?" from a
// recollection into a lookup.

import ts from "typescript";
import type { ProjectFile } from "../lib/files.js";
import { BASE_CSS, TAILWIND_CDN } from "../design.js";
import { importMapFor } from "../packages.js";

const SCRIPT_EXT = [".jsx", ".tsx", ".js", ".ts", ".mjs"];

export interface ServedFile {
  status: number;
  contentType: string;
  body: string;
}

function contentTypeFor(p: string): string {
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/javascript; charset=utf-8";
}

/**
 * Rewrite the module graph for the browser:
 *   - drop CSS imports (injected as <link> in the html instead)
 *   - give extensionless relative imports a real extension, since the
 *     browser will not guess "./App" -> "./App.jsx" the way a bundler does
 */
function rewriteImports(code: string, fromPath: string, paths: Set<string>): string {
  return code.replace(
    /(\bfrom\s*|^\s*import\s*)(["'])(\.[^"']*)\2/gm,
    (whole, lead: string, quote: string, spec: string) => {
      if (/\.(css|scss|sass|less)$/.test(spec)) return ""; // handled by <link>
      if (SCRIPT_EXT.some((e) => spec.endsWith(e))) return whole;

      const dir = fromPath.split("/").slice(0, -1).join("/");
      const base = normalise(dir ? dir + "/" + spec : spec);
      for (const e of SCRIPT_EXT) if (paths.has(base + e)) return `${lead}${quote}${spec}${e}${quote}`;
      for (const e of SCRIPT_EXT) {
        if (paths.has(`${base}/index${e}`)) return `${lead}${quote}${spec}/index${e}${quote}`;
      }
      return whole;
    }
  );
}

/** Resolve "a/b/../c" without touching the filesystem. */
function normalise(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Serves one project entirely from memory. A new project replaces the
 * previous one — there is only ever one preview.
 */
export class WebPreview {
  private files = new Map<string, string>();
  private paths = new Set<string>();

  load(files: ProjectFile[]): void {
    this.files.clear();
    this.paths.clear();
    for (const f of files) {
      const p = f.path.replace(/\\/g, "/").replace(/^\.?\//, "");
      this.files.set(p, f.content);
      this.paths.add(p);
    }
  }

  get loaded(): boolean {
    return this.files.size > 0;
  }

  clear(): void {
    this.files.clear();
    this.paths.clear();
  }

  /** Every stylesheet in the project, in a stable order. */
  private stylesheets(): string[] {
    return [...this.paths].filter((p) => p.endsWith(".css")).sort();
  }

  /**
   * Dependencies declared in package.json, if it parses.
   *
   * Only the NAMES matter now — versions come from the catalogue, so a
   * version the model invented cannot take effect.
   */
  private dependencies(): Record<string, string> {
    const raw = this.files.get("package.json");
    if (!raw) return {};
    try {
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, unknown> };
      const out: Record<string, string> = {};
      for (const k of Object.keys(pkg.dependencies ?? {})) out[k] = "";
      return out;
    } catch {
      // A malformed package.json must not take the whole preview down —
      // checkProject() already reports it as an error to the user.
      return {};
    }
  }

  private entryModule(): string | null {
    // Ordered by how likely each is to be the real entry. The list was
    // src/main.* and src/index.* only, so a project whose entry sat at
    // the repo root — or that named it App — got "No entry module" and
    // a 500, which reads as a platform fault rather than a naming one.
    const bases = ["src/main", "src/index", "main", "index", "src/App", "src/app"];
    for (const b of bases) {
      for (const e of SCRIPT_EXT) {
        if (this.paths.has(b + e)) return b + e;
      }
    }
    // Last resort: whatever actually mounts a React root. A file that
    // calls createRoot IS the entry, whatever it happens to be called.
    for (const [path, content] of this.files) {
      if (!SCRIPT_EXT.some((e) => path.endsWith(e))) continue;
      if (/createRoot\s*\(|ReactDOM\.render\s*\(/.test(content)) return path;
    }
    return null;
  }

  /**
   * The element id the app expects to mount into.
   *
   * The served page used to hardcode <div id="root">. An entry doing
   * getElementById("app") then found null, and React threw "Target
   * container is not a DOM element" — a confusing error for what is
   * really a naming mismatch. Read the id the code actually asks for.
   */
  private mountId(): string {
    for (const [path, content] of this.files) {
      if (!SCRIPT_EXT.some((e) => path.endsWith(e))) continue;
      const m = /getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/.exec(content);
      if (m?.[1]) return m[1];
    }
    const html = /<div[^>]*id=["']([\w-]+)["']/.exec(this.files.get("index.html") ?? "");
    return html?.[1] ?? "root";
  }

  private indexHtml(base: string): ServedFile {
    const entry = this.entryModule();
    if (!entry) {
      return {
        status: 500,
        contentType: "text/html; charset=utf-8",
        body: "<p>No entry module. Expected src/main.jsx.</p>",
      };
    }

    // The import map is what replaces node_modules — and it is built
    // from the CATALOGUE, not from package.json. The model used to
    // supply both the package name and the version from memory, and
    // both were guesses; a pinned list turns "does this exist?" from a
    // guess into a lookup. Anything declared but not catalogued gets an
    // entry that throws its own explanation, because leaving it out
    // produces "Failed to resolve module specifier", which looks
    // identical to a typo.
    const imports = importMapFor(this.dependencies());

    const importMap = { imports };

    const original = this.files.get("index.html") ?? "";
    const title = /<title>([^<]*)<\/title>/.exec(original)?.[1] ?? "Preview";
    const mount = this.mountId();

    const links = this.stylesheets()
      .map((p) => `<link rel="stylesheet" href="${base}/${p}">`)
      .join("\n  ");

    return {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${TAILWIND_CDN}
<style>${BASE_CSS}</style>
<script type="importmap">${JSON.stringify(importMap)}</script>
  ${links}
</head>
<body>
<div id="${mount}"></div>
<script>
// ── Storage shim ──────────────────────────────────────────
// Runs BEFORE the app, because the app reads storage while
// initialising its state.
//
// The preview frame is sandboxed without allow-same-origin, which
// gives it an opaque origin — and in an opaque origin localStorage
// does not return null, it THROWS. Every generated app that persists
// anything therefore died on its first render, and because that throw
// happened inside a useState initialiser it surfaced as an unrelated
// React error.
//
// Weakening the sandbox would fix it and is the wrong trade: this
// frame runs freshly generated code and must not be able to reach the
// platform around it. So storage gets shimmed instead. In preview it
// is in-memory; once the app is deployed to its own origin the real
// thing takes over, unchanged.
(function () {
  function works(name) {
    try { var s = window[name]; s.setItem("__p", "1"); s.removeItem("__p"); return true; }
    catch (e) { return false; }
  }
  function shim() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
      clear: function () { m = {}; },
      key: function (i) { return Object.keys(m)[i] != null ? Object.keys(m)[i] : null; },
      get length() { return Object.keys(m).length; },
    };
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    if (works(name)) return;
    try {
      Object.defineProperty(window, name, { value: shim(), configurable: true, writable: true });
    } catch (e) { /* nothing more we can do; the app will see the original throw */ }
  });
})();
</script>
<script>
// ── window.db ─────────────────────────────────────────────
// Real storage for the generated app, so its records outlive the
// browser profile and can be reached from a phone.
//
// It talks to /__data under this page's own base, which means the
// token in that base is the credential — the app is never handed one,
// and cannot name a project other than the one it is.
(function () {
  var BASE = ${JSON.stringify(base)} + "/__data/";
  var failed = false;

  async function call(method, collection, body, query) {
    var res = await fetch(BASE + collection + (query || ""), {
      method: method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var text = await res.text();
    var data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      failed = true;
      throw new Error((data && data.error) || ("Storage error " + res.status));
    }
    return data;
  }

  window.db = {
    get ready() { return !failed; },
    list: function (collection) { return call("GET", collection); },
    save: function (collection, recordOrArray) {
      return call("POST", collection, recordOrArray);
    },
    remove: function (collection, idOrArray) {
      var ids = Array.isArray(idOrArray) ? idOrArray : [idOrArray];
      return call("DELETE", collection, null, "?ids=" + ids.map(encodeURIComponent).join(","));
    },
  };
})();
</script>
<script type="module" src="${base}/${entry}"></script>
<script>
// ── Failure reporting ─────────────────────────────────────
// Errors here are the single most common way a build "looks broken".
// A missing export or a typo'd import throws before anything renders,
// so the user sees a blank frame and has no idea why.
//
// Two jobs, and the second is the important one:
//   1. print it in the frame, so it is visible at all
//   2. postMessage it OUT, so the platform can offer to fix it
// Without (2) the message is trapped in an iframe the parent cannot
// read, and the user has to retype the error by hand.
(function () {
  var MOUNT = ${JSON.stringify(mount)};
  var settled = false;

  function send(payload) {
    try { parent.postMessage(payload, "*"); } catch (e) { /* no parent */ }
  }

  function report(message, source, line) {
    if (settled) return;   // one verdict per load, not a cascade
    settled = true;
    var text = String(message || "Unknown error");
    document.body.insertAdjacentHTML("afterbegin",
      '<pre style="margin:0;padding:14px;background:#3a1d24;color:#ff9db0;' +
      'font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap">' +
      text.replace(/[<>&]/g, "") + "</pre>");
    send({ __preview: "error", message: text, source: source || "", line: line || 0 });
  }

  function ok() {
    if (settled) return;
    settled = true;
    send({ __preview: "ok" });
  }

  window.addEventListener("error", function (e) {
    report(e.message, e.filename, e.lineno);
  });
  // A failed dynamic import or a throw inside an effect surfaces here
  // rather than as an "error" event.
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    report(r && r.message ? r.message : r, "", 0);
  });

  // ── Did it render? ──
  //
  // This check previously fired 1.5s after load and looked only at
  // #root. Both were wrong. Packages are fetched from a CDN at
  // runtime, and a cold fetch of react, react-dom and a chart library
  // routinely takes longer than that — so a perfectly healthy app
  // that was still downloading got told it had rendered nothing.
  // Reporting a false failure is worse than reporting none: it sends
  // you looking for a bug that does not exist.
  //
  // So: watch for the first DOM mutation and declare success the
  // moment anything appears, and only give a verdict at the deadline
  // if nothing ever did.
  var mount = document.getElementById(MOUNT) || document.body;

  function rendered() {
    return mount.children.length > 0 ||
      (mount.textContent || "").trim().length > 0;
  }

  var observer = new MutationObserver(function () {
    if (rendered()) { observer.disconnect(); ok(); }
  });
  observer.observe(mount, { childList: true, subtree: true, characterData: true });

  window.addEventListener("load", function () {
    if (rendered()) { observer.disconnect(); return ok(); }
    setTimeout(function () {
      observer.disconnect();
      if (settled) return;
      if (rendered()) return ok();
      // Distinguish the two causes rather than blaming the component:
      // if the entry module never evaluated, the problem is upstream
      // of anything the component does.
      if (!window.__entryRan) {
        report("The entry module never finished loading, so nothing ran. This is usually a package that could not be downloaded, or an import of a file that does not exist.", "", 0);
      } else {
        report("Nothing rendered. The entry module ran but produced no output — check that the root component is exported, that render() is actually called, and that the component returns markup on every path.", "", 0);
      }
    }, 9000);
  });
})();
</script>
</body>
</html>`,
    };
  }

  /**
   * @param path  request path with the /live prefix already stripped
   * @param base  the prefix to put back on generated URLs
   */
  serve(path: string, base: string): ServedFile {
    if (!this.loaded) {
      return { status: 503, contentType: "text/plain", body: "No preview loaded." };
    }

    const clean = normalise(path.split("?")[0] ?? "");
    if (clean === "" || clean === "index.html") return this.indexHtml(base);

    const content = this.files.get(clean);
    if (content === undefined) {
      // A missing module used to be a plain-text 404. The browser
      // reported it as a bare network error with no name attached, so
      // the frame went blank and the console showed only a URL — which
      // is exactly what "the entry module never finished loading" felt
      // like from the outside.
      //
      // Answering with a module that throws puts the file name into a
      // real error, where the reporter can catch it and the Fix button
      // can act on it.
      if (SCRIPT_EXT.some((e) => clean.endsWith(e))) {
        const msg =
          `Missing file: /${clean} — it is imported somewhere in this ` +
          `project but does not exist. Create it, or remove the import.`;
        return {
          status: 404,
          contentType: "application/javascript; charset=utf-8",
          body: `throw new Error(${JSON.stringify(msg)});\n`,
        };
      }
      return { status: 404, contentType: "text/plain", body: "Not found: /" + clean };
    }

    // Non-code assets pass straight through.
    if (!SCRIPT_EXT.some((e) => clean.endsWith(e))) {
      return { status: 200, contentType: contentTypeFor(clean), body: content };
    }

    const rewritten = rewriteImports(content, clean, this.paths);
    const out = ts.transpileModule(rewritten, {
      fileName: clean,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        // The automatic runtime means generated files do not need to
        // import React themselves — which they frequently forget to do.
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "react",
      },
    });

    // A marker appended to the entry, so the failure reporter can tell
    // "the module never evaluated" (a bad import, a package that would
    // not download) from "it evaluated and rendered nothing" (a
    // component returning null). Those have completely different
    // causes, and blaming the component for the first one sends you
    // looking in the wrong file.
    const body =
      clean === this.entryModule()
        ? out.outputText + "\ntry { window.__entryRan = true; } catch (e) {}\n"
        : out.outputText;

    return { status: 200, contentType: contentTypeFor(clean), body };
  }
}

export const webPreview = new WebPreview();
