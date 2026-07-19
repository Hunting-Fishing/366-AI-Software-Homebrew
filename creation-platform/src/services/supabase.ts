// Supabase Postgres project store — Phase 3's real database.
// Implements the same ProjectStore interface as the JSON store,
// via Supabase's REST API (PostgREST). No SDK needed.
// Table setup + keys: see SETUP-SUPABASE.md.

import type {
  Project,
  ProjectFile,
  ProjectStore,
  ProjectSummary,
} from "./projects.js";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

interface Row {
  id: string;
  name: string;
  prompt: string;
  target: string;
  code: string;
  files: ProjectFile[];
  binaries: Array<{ path: string; b64: string }>;
  saved_at: string;
}

export class SupabaseProjectStore implements ProjectStore {
  private base: string;
  private key: string;

  constructor() {
    if (!supabaseConfigured()) {
      throw new Error(
        "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env (see SETUP-SUPABASE.md)."
      );
    }
    this.base = (process.env.SUPABASE_URL as string).replace(/\/$/, "") + "/rest/v1/projects";
    this.key = process.env.SUPABASE_SERVICE_KEY as string;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      "content-type": "application/json",
      ...extra,
    };
  }

  private async fail(action: string, res: Response): Promise<never> {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Supabase ${action} failed (HTTP ${res.status}): ${body}`);
  }

  async save(
    name: string,
    prompt: string,
    code: string,
    target = "web",
    files: ProjectFile[] = [],
    binaries: Array<{ path: string; b64: string }> = []
  ): Promise<Project> {
    const id =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-" + Date.now();
    const row: Row = {
      id, name, prompt, target, code, files, binaries,
      saved_at: new Date().toISOString(),
    };
    const res = await fetch(this.base, {
      method: "POST",
      headers: this.headers({ prefer: "return=minimal" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) await this.fail("save", res);
    return { id, name, prompt, target, code, files, binaries, savedAt: row.saved_at };
  }

  async list(): Promise<ProjectSummary[]> {
    const res = await fetch(this.base + "?select=id,name,saved_at&order=saved_at.desc", {
      headers: this.headers(),
    });
    if (!res.ok) await this.fail("list", res);
    const rows = (await res.json()) as Array<Pick<Row, "id" | "name" | "saved_at">>;
    return rows.map((r) => ({ id: r.id, name: r.name, savedAt: r.saved_at }));
  }

  async get(id: string): Promise<Project | null> {
    const res = await fetch(
      this.base + "?id=eq." + encodeURIComponent(id) + "&select=*",
      { headers: this.headers() }
    );
    if (!res.ok) await this.fail("get", res);
    const rows = (await res.json()) as Row[];
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, name: r.name, prompt: r.prompt, target: r.target,
      code: r.code, files: r.files ?? [], binaries: r.binaries ?? [],
      savedAt: r.saved_at,
    };
  }
}
