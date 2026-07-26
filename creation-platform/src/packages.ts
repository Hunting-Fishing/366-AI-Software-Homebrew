// The package catalogue.
//
// WHY THIS EXISTS
// Generated apps had no constraint on what they could import. The
// model picked a package name and a version from memory, and both were
// guesses — so a build could fail because a package was never
// published, or because the version was invented, or because a
// perfectly real package pulled its own copy of React. Every one of
// those surfaced in the browser as a network error, minutes after the
// generation that caused it.
//
// This is what Jordi noticed about Lovable and Bolt: they do not let
// the model shop freely. Generation is constrained to a known set,
// pinned to known-good versions. Not because the packages are
// pre-downloaded — they are not — but because a fixed catalogue turns
// "does this exist?" from a guess into a lookup.
//
// Two things follow:
//   1. The prompt lists what is available, so the model chooses from a
//      menu instead of recalling npm.
//   2. The import map is built from THIS file, not from package.json,
//      so a package the model invented cannot silently resolve to a
//      404 — it resolves to a module that says what went wrong.
//
// Adding to this list is a deliberate act: pick the version, check it
// resolves on esm.sh, and write down what it is for.

export interface CataloguedPackage {
  name: string;
  /** Exact version. Never a range — a range is how you get a surprise. */
  version: string;
  /** What it is for. This text goes into the prompt, so it must earn its tokens. */
  use: string;
  /** Always injected, whether or not package.json mentions it. */
  core?: boolean;
  /** Renders React, so it must share our React instance. */
  reactful?: boolean;
  /**
   * A native build-time dependency, not a browser one.
   *
   * Capacitor packages are installed by the person building the mobile
   * app, on their own machine. They are legitimate in package.json and
   * meaningless in an import map — the browser preview never loads
   * them — so they are allowed by the check and excluded from the map.
   */
  native?: boolean;
}

/** Pinned once, used everywhere. Two React copies is a runtime crash. */
export const REACT_VERSION = "18.3.1";

export const CATALOGUE: CataloguedPackage[] = [
  { name: "react", version: REACT_VERSION, use: "The framework itself.", core: true },
  { name: "react-dom", version: REACT_VERSION, use: "Rendering React to the page.", core: true },
  {
    name: "lucide-react",
    version: "0.454.0",
    use: "Icons. ~1500 clean stroked SVG icons as components: <Truck className=\"w-5 h-5\" />. Use this rather than hand-drawing SVG paths, and never emoji.",
    reactful: true,
  },
  {
    name: "recharts",
    version: "2.12.7",
    use: "Charts — line, bar, area, pie. Composable React components, no canvas.",
    reactful: true,
  },
  {
    name: "date-fns",
    version: "3.6.0",
    use: "Dates: format, parse, add/subtract, compare, differenceInDays. Import individual functions.",
  },
  {
    name: "clsx",
    version: "2.1.1",
    use: "Conditional class names: clsx('btn', isActive && 'btn-active').",
  },
  {
    name: "react-router-dom",
    version: "6.26.2",
    use: "Routing, when an app genuinely needs URLs per page. Prefer local state for a tabbed interface.",
    reactful: true,
  },
  {
    name: "zustand",
    version: "4.5.5",
    use: "Shared state across distant components, when prop drilling gets unreasonable. Not needed for most apps.",
    reactful: true,
  },
  // Capacitor — only for the mobile target. Never loaded in preview.
  { name: "@capacitor/core", version: "6.1.2", use: "Capacitor runtime (mobile target only).", native: true },
  { name: "@capacitor/cli", version: "6.1.2", use: "Capacitor CLI (mobile target only).", native: true },
  { name: "@capacitor/android", version: "6.1.2", use: "Android platform (mobile target only).", native: true },
  { name: "@capacitor/ios", version: "6.1.2", use: "iOS platform (mobile target only).", native: true },
  {
    name: "papaparse",
    version: "5.4.1",
    use: "Reading and writing CSV — spreadsheet import and export.",
  },
];

const BY_NAME = new Map(CATALOGUE.map((p) => [p.name, p]));

export function inCatalogue(name: string): boolean {
  return BY_NAME.has(name);
}

export function catalogued(name: string): CataloguedPackage | undefined {
  return BY_NAME.get(name);
}

/**
 * Import map entries for a project.
 *
 * Built from the catalogue, NOT from package.json, so a version the
 * model invented cannot take effect. Core packages are always present;
 * the rest are included when the project declares them.
 *
 * Anything declared but not catalogued gets an entry too — one that
 * throws a named error when imported. Leaving it out instead would
 * produce "Failed to resolve module specifier", which says nothing
 * about why, and looks identical to a typo.
 */
export function importMapFor(dependencies: Record<string, string>): Record<string, string> {
  const CDN = "https://esm.sh";
  const pin = `?deps=react@${REACT_VERSION},react-dom@${REACT_VERSION}`;
  const imports: Record<string, string> = {};

  const wanted = new Set<string>(Object.keys(dependencies));
  for (const p of CATALOGUE) if (p.core) wanted.add(p.name);

  for (const name of wanted) {
    const p = BY_NAME.get(name);
    if (!p) {
      imports[name] = notInCatalogue(name);
      continue;
    }
    // Native packages are installed on a developer's machine, not
    // fetched by the browser. An entry here would be a lie.
    if (p.native) continue;
    // React itself must not carry ?deps=react — it IS react.
    const suffix = p.name === "react" || p.name === "react-dom" ? "" : pin;
    imports[p.name] = `${CDN}/${p.name}@${p.version}${suffix}`;
    imports[`${p.name}/`] = `${CDN}/${p.name}@${p.version}/`;
  }

  // react-dom/client and the JSX runtimes are separate entry points,
  // and the automatic runtime means files need not import React.
  imports["react-dom"] = `${CDN}/react-dom@${REACT_VERSION}?deps=react@${REACT_VERSION}`;
  imports["react/jsx-runtime"] = `${CDN}/react@${REACT_VERSION}/jsx-runtime`;
  imports["react/jsx-dev-runtime"] = `${CDN}/react@${REACT_VERSION}/jsx-dev-runtime`;

  return imports;
}

/** Names a browser can actually load — natives are build-time only. */
export function browserPackages(): string[] {
  return CATALOGUE.filter((p) => !p.native).map((p) => p.name);
}

/** A module that explains itself instead of 404ing anonymously. */
function notInCatalogue(name: string): string {
  const msg =
    `"${name}" is not an available package. This project can only use: ` +
    browserPackages().join(", ") +
    `. Remove the import, or rebuild the feature with one of those.`;
  return "data:text/javascript," + encodeURIComponent(`throw new Error(${JSON.stringify(msg)});`);
}

/**
 * The catalogue as prompt text.
 *
 * Written as a menu, because "use real packages" does not stop a model
 * inventing one — a list does.
 */
export function catalogueRules(): string {
  const lines = CATALOGUE.filter((p) => !p.core && !p.native).map(
    (p) => `- ${p.name}@${p.version} — ${p.use}`
  );
  return [
    "AVAILABLE PACKAGES — this list is exhaustive",
    "- react@" + REACT_VERSION + " and react-dom@" + REACT_VERSION + " are always available.",
    ...lines,
    "",
    "- Do NOT import anything not on this list. There is no node_modules and no install step; an unlisted package fails at runtime in the browser, after the build has already reported success.",
    "- Declare every package you import in package.json dependencies, at exactly the version above. The platform pins versions itself, so a range or a different number is ignored — but a missing entry means the package is not loaded at all.",
    "- Prefer no dependency. Most of what these apps need is plain React and Tailwind. Reach for the list only when it genuinely saves real work.",
  ].join("\n");
}
