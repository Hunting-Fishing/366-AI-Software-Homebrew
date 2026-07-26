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
// The generated projects only ever import react and react-dom (the
// system prompt in targets.ts forbids other packages), but the import
// map falls through to esm.sh for anything else, so an occasional
// extra dependency still resolves.

import ts from "typescript";
import type { ProjectFile } from "../lib/files.js";
import { BASE_CSS, TAILWIND_CDN } from "../design.js";

const CDN = "https://esm.sh";
const REACT = "18.3.1";

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

  /** Dependencies declared in package.json, if it parses. */
  private dependencies(): Record<string, unknown> {
    const raw = this.files.get("package.json");
    if (!raw) return {};
    try {
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, unknown> };
      return pkg.dependencies ?? {};
    } catch {
      // A malformed package.json must not take the whole preview down —
      // checkProject() already reports it as an error to the user.
      return {};
    }
  }

  private entryModule(): string | null {
    for (const e of SCRIPT_EXT) {
      if (this.paths.has("src/main" + e)) return "src/main" + e;
      if (this.paths.has("src/index" + e)) return "src/index" + e;
    }
    return null;
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

    // The import map is what replaces node_modules. React must resolve
    // to ONE instance, or hooks throw "invalid hook call" — hence
    // pinning every react entry point to the same version.
    const imports: Record<string, string> = {
      react: `${CDN}/react@${REACT}`,
      "react/": `${CDN}/react@${REACT}/`,
      "react-dom": `${CDN}/react-dom@${REACT}?deps=react@${REACT}`,
      "react-dom/": `${CDN}/react-dom@${REACT}/`,
      "react/jsx-runtime": `${CDN}/react@${REACT}/jsx-runtime`,
      "react/jsx-dev-runtime": `${CDN}/react@${REACT}/jsx-dev-runtime`,
    };

    // Any other dependency the model declared gets an entry too, so a
    // project that reaches for recharts or date-fns still runs. Import
    // maps have no wildcard, so each name must be listed — hence reading
    // them out of package.json rather than guessing.
    //
    // ?deps=react@... keeps libraries that bundle their own React copy
    // on OUR React. Two copies is the classic "invalid hook call".
    for (const [name, range] of Object.entries(this.dependencies())) {
      if (name === "react" || name === "react-dom") continue;
      const version = String(range).replace(/^[\^~>=<\s]+/, "") || "latest";
      imports[name] = `${CDN}/${name}@${version}?deps=react@${REACT},react-dom@${REACT}`;
      imports[`${name}/`] = `${CDN}/${name}@${version}/`;
    }

    const importMap = { imports };

    const original = this.files.get("index.html") ?? "";
    const title = /<title>([^<]*)<\/title>/.exec(original)?.[1] ?? "Preview";

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
<div id="root"></div>
<script type="module" src="${base}/${entry}"></script>
<script>
window.addEventListener("error", function (e) {
  document.body.insertAdjacentHTML("afterbegin",
    '<pre style="margin:0;padding:14px;background:#3a1d24;color:#ff9db0;' +
    'font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap">' +
    String(e.message).replace(/[<>&]/g, "") + "</pre>");
});
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

    return { status: 200, contentType: contentTypeFor(clean), body: out.outputText };
  }
}

export const webPreview = new WebPreview();
