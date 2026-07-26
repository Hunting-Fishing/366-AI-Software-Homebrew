import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONNECTORS, CATEGORIES, connector, availableConnectors } from "../src/connectors.js";

// The catalogue lists everything, not just the two that work.
//
// Showing only the working ones answers "what can this do?" with
// "almost nothing" — discouraging, and untrue about the direction.
// Showing all of them with honest status answers the real question,
// and every unbuilt card links out to the service so it is useful
// today even though the integration is not.
//
// The rule these tests enforce: status must never flatter.

test("every connector is uniquely identified", () => {
  const ids = CONNECTORS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate connector id");
});

test("the catalogue is worth browsing", () => {
  assert.ok(CONNECTORS.length >= 90, `only ${CONNECTORS.length} connectors`);
});

test("every entry says what it does for a project", () => {
  for (const c of CONNECTORS) {
    assert.ok(c.blurb.length > 15, `${c.id}: blurb too thin`);
    assert.ok(c.name.length > 1, `${c.id}: no name`);
    assert.match(c.mark, /^[A-Z0-9]{2}$/, `${c.id}: mark should be two characters`);
    assert.match(c.tint, /^#[0-9a-f]{6}$/i, `${c.id}: tint should be a hex colour`);
  }
});

test("every unbuilt connector links to the service", () => {
  // This is the whole reason an unbuilt card earns its place. Without
  // the link it is an advert for something that does not exist.
  for (const c of CONNECTORS) {
    if (c.status !== "soon") continue;
    assert.match(c.url, /^https:\/\//, `${c.id} is "soon" with no link to follow`);
  }
});

test("status never flatters", () => {
  // "available" must mean linking it actually does something. Two are
  // wired up through routes/integrations.ts, plus the built-in ones.
  const wired = new Set(["supabase", "github", "cloud", "netlify"]);
  for (const c of availableConnectors()) {
    assert.ok(wired.has(c.id), `${c.id} claims to be available but nothing implements it`);
  }
});

test("a connector that takes credentials says what to paste", () => {
  for (const c of CONNECTORS) {
    if (c.status !== "available" || !c.fields) continue;
    assert.ok(c.fields.length > 0, `${c.id}: no fields`);
    assert.ok(c.secretLabel, `${c.id}: no secret label`);
    assert.ok((c.secretHint ?? "").length > 20, `${c.id}: the hint must say where the secret goes`);
    for (const f of c.fields) {
      assert.ok(f.label && f.placeholder, `${c.id}: field ${f.key} is unlabelled`);
    }
  }
});

test("the two that matter are present and available", () => {
  for (const id of ["supabase", "github"]) {
    const c = connector(id);
    assert.ok(c, `${id} missing`);
    assert.equal(c!.status, "available");
  }
});

test("every connector sits in a declared category", () => {
  for (const c of CONNECTORS) {
    assert.ok(CATEGORIES.includes(c.category), `${c.id} is in unknown category ${c.category}`);
  }
});

test("no category is declared but empty", () => {
  for (const cat of CATEGORIES) {
    assert.ok(CONNECTORS.some((c) => c.category === cat), `${cat} has no connectors`);
  }
});

test("the ones Lovable shows are all here", () => {
  // Straight from the screenshots, so the comparison is like for like.
  for (const id of [
    "cloud", "gmaps", "resend", "supabase", "paddle", "apollo", "dbt", "slack",
    "openai", "firecrawl", "github", "stripe", "shopify", "clickhouse", "gmail", "gdrive",
  ]) {
    assert.ok(connector(id), `${id} is in Lovable's list but not ours`);
  }
});

// ── The browser ─────────────────────────────────────────────

const PAGE = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("it is a browser, not a list: sidebar, search, grid, detail", () => {
  assert.match(PAGE, /id="conNav"/);
  assert.match(PAGE, /id="conSearch"/);
  assert.match(PAGE, /grid\.className = "conGrid"/);
  assert.match(PAGE, /function renderConnectorDetail/);
});

test("filtering by category and by search both work", () => {
  assert.match(PAGE, /function matches\(c\)/);
  assert.match(PAGE, /conFilter !== "all" && conFilter !== "enabled"/);
  assert.match(PAGE, /c\.name\.toLowerCase\(\)\.includes\(q\)/);
});

test("working connectors sort to the front", () => {
  // The useful answer to "what can I use right now" is at the top.
  assert.match(PAGE, /a\.status === "available" \? 0 : 1/);
});

test("an unbuilt connector says so plainly and offers the link", () => {
  assert.match(PAGE, /Not built yet/);
  assert.match(PAGE, /Visit " \+ c\.name/);
});

test("brand logos are not shipped — a monogram tile stands in", () => {
  // Trademarks are not ours to redistribute, and a wall of hotlinked
  // logos breaks the moment one of them moves.
  assert.match(PAGE, /Brand logos are not ours to ship/);
  assert.match(PAGE, /el\.className = "tile"/);
  assert.match(PAGE, /el\.textContent = c\.mark/, "the tile shows a monogram, not an image");
  assert.doesNotMatch(PAGE, /logo\.clearbit\.com|<img[^>]*logo/i, "no hotlinked brand logos");
});

test("a secret is cleared from the DOM after saving", () => {
  assert.match(PAGE, /secretInput\.value = "";\s*\/\/ never leave a secret/);
});

test("the connector list comes from the server, not a copy in the page", () => {
  // Two copies of a 100-entry catalogue is two catalogues that drift.
  assert.match(PAGE, /fetch\("\/api\/connectors"\)/);
  assert.doesNotMatch(PAGE, /const INTEGRATIONS = \[/);
});
