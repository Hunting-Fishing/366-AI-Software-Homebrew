import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGN_RULES, DESIGN_TASTE } from "../src/design.js";

// Reported as: "we are still using what looks like Windows 95 icons…
// Poor Styling".
//
// The cause was not the layout or the palette — it was that every icon
// in the chrome was an emoji character. Emoji are rendered by the
// operating system's own bitmap font: they ignore the surrounding text
// colour, ignore the type scale, and look different on every machine.
// One emoji in a toolbar undoes an otherwise careful interface.
//
// These tests pin the fix in place, because emoji are exactly the kind
// of thing that creeps back in one convenient character at a time.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"),
  "utf8"
);

/** The markup, minus the <script> block and minus <option> text. */
function chrome(): string {
  return HTML
    .replace(/<script[\s\S]*?<\/script>/g, "")
    // A <option> cannot contain markup, so a glyph is the only choice
    // there; those are excluded deliberately rather than overlooked.
    .replace(/<option[\s\S]*?<\/option>/g, "");
}

// Pictographs, dingbats, transport/map symbols, and the variation
// selector that turns a plain glyph into a colour emoji.
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;

test("no emoji anywhere in the page chrome", () => {
  const hit = chrome().match(new RegExp(EMOJI, "gu"));
  assert.equal(
    hit,
    null,
    `emoji in the chrome: ${JSON.stringify(hit)} — use <span data-icon="…"> instead`
  );
});

test("no emoji in button labels set from JavaScript", () => {
  // setBtn()/iconLine() exist so a state change cannot quietly drop the
  // icon. A raw textContent assignment with an emoji in it bypasses both.
  const assignments = HTML.match(/\.textContent\s*=\s*"[^"]*"/g) ?? [];
  const bad = assignments.filter((a) => EMOJI.test(a));
  assert.deepEqual(bad, [], "these should go through setBtn() or iconLine()");
});

test("the icon set is inlined, not fetched from a CDN", () => {
  // A CDN icon font would reintroduce the original problem in a new
  // form: a blocking request, and no icons at all when it fails.
  assert.match(HTML, /const ICONS = \{/);
  assert.doesNotMatch(HTML, /fontawesome|feathericons|unpkg\.com\/lucide/i);
});

test("every icon referenced by the markup actually exists", () => {
  // A typo in data-icon fails silently — paintIcons() just leaves the
  // span empty, so the button loses its icon and nothing complains.
  const defined = new Set(
    [...HTML.matchAll(/^\s*"([a-z-]+)":\s*'</gm)].map((m) => m[1])
  );
  assert.ok(defined.size > 10, "icon table did not parse");

  // From the markup only — a data-icon mentioned in a JS comment is
  // prose, not a reference.
  const used = [...chrome().matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]);
  const usedInJs = [...HTML.matchAll(/(?:setBtn|iconLine)\([^,]+,\s*"([^"]+)"/g)]
    .map((m) => m[1]);

  assert.ok(used.length > 5, "markup uses no icons at all");
  for (const name of [...used, ...usedInJs]) {
    assert.ok(defined.has(name!), `data-icon="${name}" has no entry in ICONS`);
  }
});

test("icons inherit the text colour", () => {
  // The single property that emoji could never have. Without it an
  // icon is a fixed colour and drifts from its label in every theme.
  assert.match(HTML, /svg\.i \{[^}]*stroke: currentColor/);
});

// ── Themes ──────────────────────────────────────────────────

test("both themes are defined", () => {
  assert.match(HTML, /\[data-theme="light"\] \{/);
  assert.match(HTML, /:root, \[data-theme="dark"\] \{/);
});

test("the light theme overrides every token the dark theme sets", () => {
  // A token defined only in dark keeps its dark value in light mode —
  // which is how one stray hard-coded panel ends up black on white.
  const grab = (re: RegExp) => {
    const block = HTML.match(re)?.[1] ?? "";
    return new Set([...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
  };
  const dark = grab(/:root, \[data-theme="dark"\] \{([\s\S]*?)\}/);
  const light = grab(/\[data-theme="light"\] \{([\s\S]*?)\}/);

  assert.ok(dark.size > 20, "dark tokens did not parse");
  // Radii and the like are genuinely shared; colours are not.
  const shared = new Set(["--r", "--r-lg"]);
  const missing = [...dark].filter((t) => !light.has(t!) && !shared.has(t!));
  assert.deepEqual(missing, [], "tokens with no light-mode value");
});

test("colour is never hard-coded outside the token blocks", () => {
  // Hex outside :root is what makes a theme switch a 40-rule audit
  // instead of swapping one block.
  const css = HTML.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const body = css
    .replace(/:root, \[data-theme="dark"\] \{[\s\S]*?\}/, "")
    .replace(/\[data-theme="light"\] \{[\s\S]*?\}/, "")
    // Data-URI SVGs (the select chevron) carry their own colour and
    // cannot reference a CSS variable.
    .replace(/url\("data:[^"]*"\)/g, "");
  const hex = body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  // #fff on the accent button is legitimate: it sits on the accent
  // colour, which is the same in both themes.
  const suspicious = hex.filter((h) => !/^#(fff|ffffff)$/i.test(h));
  assert.deepEqual(suspicious, [], "hard-coded colours that will not theme");
});

test("the theme choice is three-way, not a toggle", () => {
  // "System" has to be a real option and the default: a builder tool
  // that ignores the OS setting is the thing that feels wrong at 11pm.
  for (const v of ["light", "dark", "system"]) {
    assert.match(HTML, new RegExp(`data-theme-set="${v}"`));
  }
  assert.match(HTML, /prefers-color-scheme: dark/, "system mode must read the OS");
  assert.match(HTML, /colorScheme = actual/, "native widgets must follow too");
});

// ── Project menu ────────────────────────────────────────────

test("the brand button opens a menu", () => {
  assert.match(HTML, /id="brandBtn"[^>]*aria-haspopup="menu"/);
  assert.match(HTML, /id="projMenu"[^>]*role="menu"/);
});

test("the menu is positioned on open, not nested in the header", () => {
  // The header scrolls horizontally on a narrow window, and a popover
  // parented inside a scrolling box gets clipped by it.
  assert.match(HTML, /\.menu \{[^}]*position: fixed/);
  assert.match(HTML, /getBoundingClientRect\(\)/);
});

test("menu actions reuse the header buttons rather than reimplementing them", () => {
  // Two code paths for "download this project" is how the two drift.
  for (const id of ["saveBtn", "downloadBtn", "publishBtn"]) {
    assert.match(HTML, new RegExp(`\\$\\("${id}"\\)\\.click\\(\\)`));
  }
});

test("Escape closes the menu", () => {
  assert.match(HTML, /e\.key === "Escape"/);
});

test("renaming does not create a version", () => {
  // Same rule as ticking a task: a version should mean a build
  // happened. Renames would otherwise bury the real restore points.
  const block = HTML.match(/\$\("mRename"\)\.onclick[\s\S]*?^\};/m)?.[0] ?? "";
  assert.match(block, /silent: true/);
});

// ── The same rule, applied to generated apps ────────────────

test("generated apps are told not to use emoji as icons either", () => {
  // The preview screenshot had the same problem one level down: the
  // model reached for 📊 and 📦 because nothing told it not to.
  assert.match(DESIGN_RULES, /Never emoji/i);
  // The advice changed from hand-drawn SVG to the icon package once
  // lucide-react entered the catalogue; the ban did not.
  assert.match(DESIGN_RULES, /lucide-react/);
  assert.match(DESIGN_TASTE, /emoji/i);
});

test("the icon rule explains what to do instead, not just what to avoid", () => {
  // A prohibition on its own leaves the model with no icon at all,
  // which is worse than the emoji.
  assert.match(DESIGN_RULES, /import \{ Truck, Receipt, Users \} from 'lucide-react'/);
  assert.match(DESIGN_RULES, /aria-hidden/);
});
