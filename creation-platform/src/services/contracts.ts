// What a refactor must not break.
//
// WHY THIS EXISTS
// Splitting a big file is the single most dangerous edit this platform
// can make. Everything else adds; a refactor MOVES things, and every
// move is a chance to drop something another part of the app depends
// on. The app still compiles, the preview still loads, and a route is
// quietly gone — or a database collection is now spelled differently
// and yesterday's records are invisible.
//
// The danger is not "the code changed". It is that a CONTRACT changed:
// something outside the edited file relied on a name, and that name
// moved or vanished. So the contracts are extracted before the edit,
// stated in the prompt as invariants, and checked afterwards.
//
// Three surfaces matter, in order of how badly they fail:
//
//   collections   db.list('employees') — the name IS the storage key.
//                 Rename it and the data is not lost, it is orphaned,
//                 which looks exactly like data loss to whoever is
//                 using the app. Silent, and the worst of the three.
//   routes        a path someone has bookmarked or linked to.
//   exports       what other files import. Loudest — it throws — but
//                 only at runtime, in the browser, after the build has
//                 reported success.
//
// Extraction is regex-based, not a parser. A refactor is exactly when
// files are most likely to be mid-edit and unparseable, and a checker
// that gives up precisely when it is needed is worse than one that
// occasionally over-reports.

import type { ProjectFile } from "../lib/files.js";

export interface Contracts {
  /** path -> exported symbol names. */
  exports: Record<string, string[]>;
  /** path -> { from, names } for each import. */
  imports: Record<string, Array<{ from: string; names: string[] }>>;
  /** Storage collection names — db.list('x'), db.save('x', …). */
  collections: string[];
  /** Route paths declared anywhere in the project. */
  routes: string[];
  /** localStorage / sessionStorage keys. */
  storageKeys: string[];
  /** Flask/Express endpoint paths. */
  endpoints: string[];
}

const CODE = /\.(jsx?|tsx?|mjs|py)$/;

function exportsOf(content: string): string[] {
  const out = new Set<string>();
  // export function X / export const X / export class X
  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    out.add(m[1]!);
  }
  // export { a, b as c }
  for (const m of content.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of (m[1] ?? "").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) out.add(name);
    }
  }
  if (/export\s+default/.test(content)) out.add("default");
  return [...out];
}

function importsOf(content: string): Array<{ from: string; names: string[] }> {
  const out: Array<{ from: string; names: string[] }> = [];
  for (const m of content.matchAll(
    /import\s+([\s\S]*?)\s+from\s*["']([^"']+)["']/g
  )) {
    const clause = m[1] ?? "";
    const from = m[2] ?? "";
    const names: string[] = [];

    // Default import: `import Foo from` or `import Foo, { a } from`
    const def = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (def) names.push("default");

    const braced = /\{([^}]*)\}/.exec(clause);
    if (braced) {
      for (const part of (braced[1] ?? "").split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0]?.trim();
        if (name) names.push(name);
      }
    }
    out.push({ from, names });
  }
  return out;
}

function allMatches(files: ProjectFile[], re: RegExp, group = 1): string[] {
  const out = new Set<string>();
  for (const f of files) {
    for (const m of f.content.matchAll(re)) {
      const v = m[group];
      if (v) out.add(v);
    }
  }
  return [...out].sort();
}

export function extractContracts(files: ProjectFile[]): Contracts {
  const exports: Record<string, string[]> = {};
  const imports: Record<string, Array<{ from: string; names: string[] }>> = {};

  for (const f of files) {
    if (!CODE.test(f.path)) continue;
    exports[f.path] = exportsOf(f.content);
    imports[f.path] = importsOf(f.content);
  }

  return {
    exports,
    imports,
    collections: allMatches(files, /\bdb\s*\.\s*(?:list|save|remove)\s*\(\s*["'`]([\w-]+)["'`]/g),
    routes: allMatches(files, /(?:path|to|href)\s*[:=]\s*["'`](\/[\w\-/:.]*)["'`]/g),
    storageKeys: allMatches(files, /(?:localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\s*\(\s*["'`]([^"'`]+)["'`]/g),
    endpoints: allMatches(files, /@app\.route\s*\(\s*["'`]([^"'`]+)["'`]|app\.(?:get|post|put|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g),
  };
}

/** Resolve a relative import to a project path, or null if it is a package. */
export function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const dir = from.split("/").slice(0, -1).join("/");
  const joined = (dir ? dir + "/" + spec : spec).split("/");
  const parts: string[] = [];
  for (const p of joined) {
    if (p === "." || p === "") continue;
    if (p === "..") parts.pop();
    else parts.push(p);
  }
  const base = parts.join("/");
  if (paths.has(base)) return base;
  for (const e of [".jsx", ".tsx", ".js", ".ts", ".mjs"]) {
    if (paths.has(base + e)) return base + e;
    if (paths.has(base + "/index" + e)) return base + "/index" + e;
  }
  return null;
}

export interface Violation {
  /** Plain language, addressed to whoever has to fix it. */
  message: string;
  /** The file that will break. */
  file: string;
}

/**
 * Imports that name something their source does not export.
 *
 * checkProject already verifies the FILE exists. This is the next
 * failure along and the one a refactor actually causes: the file is
 * there, the symbol moved out of it, and nothing notices until the
 * browser throws "does not provide an export named".
 */
export function contractViolations(files: ProjectFile[]): Violation[] {
  const c = extractContracts(files);
  const paths = new Set(files.map((f) => f.path));
  const out: Violation[] = [];

  for (const [file, list] of Object.entries(c.imports)) {
    for (const imp of list) {
      const target = resolveImport(file, imp.from, paths);
      if (!target) continue;                     // package, or already reported missing
      const available = c.exports[target];
      if (!available) continue;                  // not a code file we can read
      for (const name of imp.names) {
        if (!available.includes(name)) {
          out.push({
            file,
            message:
              `${file} imports ${name === "default" ? "a default export" : `"${name}"`} ` +
              `from ${imp.from}, but ${target} does not export it. ` +
              `Either export it there, or import it from wherever it now lives.`,
          });
        }
      }
    }
  }
  return out;
}

export interface ContractLoss {
  kind: "collection" | "route" | "storage" | "endpoint" | "export";
  name: string;
  /** Why losing this one matters, in plain language. */
  why: string;
}

/**
 * What disappeared between two versions of a project.
 *
 * Not every loss is a bug — deleting a feature deletes its route. But
 * a refactor is supposed to move things, not remove them, so in that
 * context every entry here is worth showing.
 */
export function contractDiff(before: Contracts, after: Contracts): ContractLoss[] {
  const out: ContractLoss[] = [];
  const gone = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

  for (const name of gone(before.collections, after.collections)) {
    out.push({
      kind: "collection",
      name,
      why: `Nothing reads or writes the "${name}" collection any more. Existing records are still in the database but the app can no longer see them, which looks exactly like data loss to whoever is using it.`,
    });
  }
  for (const name of gone(before.routes, after.routes)) {
    out.push({ kind: "route", name, why: `The route "${name}" is gone. Any link or bookmark to it now leads nowhere.` });
  }
  for (const name of gone(before.storageKeys, after.storageKeys)) {
    out.push({ kind: "storage", name, why: `The saved setting "${name}" is no longer read, so it silently reverts to its default.` });
  }
  for (const name of gone(before.endpoints, after.endpoints)) {
    out.push({ kind: "endpoint", name, why: `The endpoint "${name}" no longer exists.` });
  }

  // An export that vanished from the project entirely — moving it
  // between files is fine and must not be reported.
  const flat = (c: Contracts) => new Set(Object.values(c.exports).flat());
  const beforeAll = flat(before);
  const afterAll = flat(after);
  for (const name of beforeAll) {
    if (name === "default") continue;   // every file has one; movement is meaningless
    if (!afterAll.has(name)) {
      out.push({ kind: "export", name, why: `"${name}" is no longer exported anywhere in the project.` });
    }
  }
  return out;
}

/**
 * The invariants, written into the prompt.
 *
 * Listing them explicitly is the whole safety mechanism: a model
 * splitting a 700-line file has no way to know that 'employees' is a
 * storage key rather than a variable name unless it is told.
 */
export function contractBrief(c: Contracts): string {
  const lines: string[] = [
    "MUST NOT CHANGE — these are contracts, not implementation details.",
    "Moving them between files is fine. Renaming, removing or re-spelling any of them breaks something outside the file you are editing.",
    "",
  ];

  if (c.collections.length) {
    lines.push(
      "Storage collections — the string IS the database key. Rename one and existing records become invisible to the app, which is indistinguishable from data loss:",
      ...c.collections.map((n) => `  db.list('${n}') / db.save('${n}', …)`),
      ""
    );
  }
  if (c.routes.length) {
    lines.push("Routes — people link to these:", ...c.routes.map((n) => `  ${n}`), "");
  }
  if (c.storageKeys.length) {
    lines.push(
      "Saved settings — a renamed key reverts silently to its default:",
      ...c.storageKeys.map((n) => `  ${n}`),
      ""
    );
  }
  if (c.endpoints.length) {
    lines.push("Endpoints:", ...c.endpoints.map((n) => `  ${n}`), "");
  }

  lines.push(
    "Also:",
    "- Every symbol another file imports must still be exported from somewhere, and every import updated to point at its new home.",
    "- Field names inside stored records are part of the storage contract too. Do not rename record fields while splitting files.",
    "- Component props keep their names. A renamed prop is a silent break: the component renders, the value is undefined.",
    "- If you genuinely need to rename one of the above, say so plainly in your one-line summary rather than doing it quietly."
  );
  return lines.join("\n");
}
