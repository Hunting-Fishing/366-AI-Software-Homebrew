// Per-project integrations — a user's own Supabase, their GitHub repo.
//
// WHY IT IS SEPARATE FROM THE PROJECT ROW
// These are credentials. Keeping them in projects.files or
// projects.brain would mean they ride along in every project read,
// every version snapshot, and every history diff shown in the UI. A
// secret that appears in a diff is a secret that has leaked.
//
// THE ONE RULE
// A secret goes in and never comes back out. GET returns config and a
// `hasSecret` boolean, never the value. Nothing here writes a secret
// into a response, and the test asserts that by reading this file.

import { Router, type Request, type Response } from "express";
import { supabaseConfigured } from "../services/supabase.js";

export type IntegrationKind = "supabase" | "github";

const KINDS: IntegrationKind[] = ["supabase", "github"];

export interface Integration {
  kind: IntegrationKind;
  config: Record<string, unknown>;
  hasSecret: boolean;
  connectedAt: string;
}

/** What the browser is allowed to see. Never the secret. */
function publicView(row: {
  kind: string;
  config: Record<string, unknown>;
  secret: string | null;
  connected_at: string;
}): Integration {
  return {
    kind: row.kind as IntegrationKind,
    config: row.config ?? {},
    hasSecret: Boolean(row.secret),
    connectedAt: row.connected_at,
  };
}

function rest(): { base: string; key: string } | null {
  if (!supabaseConfigured()) return null;
  return {
    base: (process.env.SUPABASE_URL as string).replace(/\/$/, "") + "/rest/v1/project_integrations",
    key: process.env.SUPABASE_SERVICE_KEY as string,
  };
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...extra,
  };
}

/** Ownership is enforced in the query — the service key bypasses RLS. */
function owner(userId?: string): string {
  return userId ? "&user_id=eq." + encodeURIComponent(userId) : "&user_id=is.null";
}

export const integrationsRouter = Router();

integrationsRouter.get("/api/projects/:id/integrations", async (req: Request, res: Response) => {
  const r = rest();
  if (!r) { res.json([]); return; }   // no database: nothing can be linked
  try {
    const out = await fetch(
      r.base + "?project_id=eq." + encodeURIComponent(req.params.id ?? "") +
        "&select=kind,config,secret,connected_at" + owner(req.user?.id),
      { headers: headers(r.key) }
    );
    if (!out.ok) throw new Error("HTTP " + out.status);
    const rows = (await out.json()) as Parameters<typeof publicView>[0][];
    res.json(rows.map(publicView));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

integrationsRouter.put("/api/projects/:id/integrations/:kind", async (req: Request, res: Response) => {
  const kind = String(req.params.kind ?? "");
  if (!KINDS.includes(kind as IntegrationKind)) {
    res.status(400).json({ error: `Unknown integration "${kind}".` });
    return;
  }
  const r = rest();
  if (!r) {
    res.status(409).json({
      error: "Integrations need a database. Configure Supabase for the platform first.",
    });
    return;
  }

  const { config, secret } = req.body as { config?: Record<string, unknown>; secret?: string };
  try {
    const row: Record<string, unknown> = {
      project_id: req.params.id,
      kind,
      config: config ?? {},
      user_id: req.user?.id ?? null,
      connected_at: new Date().toISOString(),
    };
    // Omitting the secret keeps whatever is stored, so a user editing a
    // repo name does not have to paste their token again.
    if (typeof secret === "string" && secret.length > 0) row["secret"] = secret;

    const out = await fetch(r.base, {
      method: "POST",
      headers: headers(r.key, { prefer: "return=minimal,resolution=merge-duplicates" }),
      body: JSON.stringify(row),
    });
    if (!out.ok) throw new Error((await out.text()).slice(0, 200));
    // Deliberately not echoing the row back: the response would carry
    // the secret straight to the browser.
    res.json({ ok: true, kind });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

integrationsRouter.delete("/api/projects/:id/integrations/:kind", async (req: Request, res: Response) => {
  const r = rest();
  if (!r) { res.json({ ok: true }); return; }
  try {
    const out = await fetch(
      r.base + "?project_id=eq." + encodeURIComponent(req.params.id ?? "") +
        "&kind=eq." + encodeURIComponent(String(req.params.kind)) + owner(req.user?.id),
      { method: "DELETE", headers: headers(r.key, { prefer: "return=minimal" }) }
    );
    if (!out.ok) throw new Error("HTTP " + out.status);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
