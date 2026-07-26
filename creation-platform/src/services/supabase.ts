// Supabase Postgres project store — Phase 3's real database.
// Implements the same ProjectStore interface as the JSON store,
// via Supabase's REST API (PostgREST). No SDK needed.
// Table setup + keys: see SETUP-SUPABASE.md.

import {
  applyPatch,
  makeProjectId,
  versionLabel,
  type Binary,
  type Project,
  type ProjectFile,
  type ProjectPatch,
  type ProjectStore,
  type ProjectSummary,
  type VersionSummary,
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
  brain: Record<string, unknown>;
  saved_at: string;
  /** Owner account (accounts mode); null for rows saved before Phase 3.3. */
  user_id?: string | null;
}

/** One row of public.project_versions. */
interface VersionRow {
  version: number;
  label: string | null;
  prompt: string;
  target: string;
  code: string;
  files: ProjectFile[];
  binaries: Binary[];
  brain: Record<string, unknown>;
  created_at: string;
}

export class SupabaseProjectStore implements ProjectStore {
  private base: string;
  private versionsBase: string;
  private key: string;

  constructor() {
    if (!supabaseConfigured()) {
      throw new Error(
        "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env (see SETUP-SUPABASE.md)."
      );
    }
    const root = (process.env.SUPABASE_URL as string).replace(/\/$/, "") + "/rest/v1";
    this.base = root + "/projects";
    this.versionsBase = root + "/project_versions";
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
    binaries: Array<{ path: string; b64: string }> = [],
    userId?: string
  ): Promise<Project> {
    const id = makeProjectId(name);
    const row: Row = {
      id, name, prompt, target, code, files, binaries,
      brain: {},
      saved_at: new Date().toISOString(),
      user_id: userId ?? null,
    };
    const res = await fetch(this.base, {
      method: "POST",
      headers: this.headers({ prefer: "return=minimal" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) await this.fail("save", res);

    const project: Project = {
      id, name, prompt, target, code, files, binaries, brain: {}, savedAt: row.saved_at,
    };
    // Version 1. Best effort: a project that saved but failed to record
    // its history is still a saved project, and losing the save because
    // the history write failed would be the worse outcome.
    await this.appendVersion(project, versionLabel({}, prompt), userId).catch(() => undefined);
    return project;
  }

  // The server talks to Supabase with the service key (bypasses RLS),
  // so ownership is enforced here in the queries: each user sees only
  // their own rows. Undefined userId = single-user mode; it sees the
  // pre-accounts rows (user_id null).
  private ownerFilter(userId?: string): string {
    return userId
      ? "&user_id=eq." + encodeURIComponent(userId)
      : "&user_id=is.null";
  }

  async list(userId?: string): Promise<ProjectSummary[]> {
    const res = await fetch(
      this.base + "?select=id,name,saved_at&order=saved_at.desc" + this.ownerFilter(userId),
      { headers: this.headers() }
    );
    if (!res.ok) await this.fail("list", res);
    const rows = (await res.json()) as Array<Pick<Row, "id" | "name" | "saved_at">>;
    return rows.map((r) => ({ id: r.id, name: r.name, savedAt: r.saved_at }));
  }

  async get(id: string, userId?: string): Promise<Project | null> {
    const res = await fetch(
      this.base + "?id=eq." + encodeURIComponent(id) + "&select=*" + this.ownerFilter(userId),
      { headers: this.headers() }
    );
    if (!res.ok) await this.fail("get", res);
    const rows = (await res.json()) as Row[];
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, name: r.name, prompt: r.prompt, target: r.target,
      code: r.code, files: r.files ?? [], binaries: r.binaries ?? [],
      brain: r.brain ?? {},
      savedAt: r.saved_at,
    };
  }

  // ── version history ────────────────────────────────────────

  /** Next version number for a project. 1 when there is no history. */
  private async nextVersion(projectId: string): Promise<number> {
    const res = await fetch(
      this.versionsBase +
        "?project_id=eq." + encodeURIComponent(projectId) +
        "&select=version&order=version.desc&limit=1",
      { headers: this.headers() }
    );
    if (!res.ok) await this.fail("version lookup", res);
    const rows = (await res.json()) as Array<{ version: number }>;
    return (rows[0]?.version ?? 0) + 1;
  }

  private async appendVersion(
    project: Project,
    label: string,
    userId?: string
  ): Promise<void> {
    // Reading max(version) and then inserting is a read-then-write race:
    // two saves in flight both read the same number and the second hits
    // project_versions_unique_version. PostgREST cannot express
    // "insert ... select max+1" in one statement, so instead the unique
    // constraint IS the concurrency control — on a collision, re-read
    // and try again. The constraint doing this job is the point of it.
    const MAX_ATTEMPTS = 6;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await fetch(this.versionsBase, {
        method: "POST",
        headers: this.headers({ prefer: "return=minimal" }),
        body: JSON.stringify({
          project_id: project.id,
          version: await this.nextVersion(project.id),
          label,
          prompt: project.prompt,
          target: project.target,
          code: project.code,
          files: project.files,
          binaries: project.binaries,
          brain: project.brain,
          user_id: userId ?? null,
          created_at: project.savedAt,
        }),
      });
      if (res.ok) return;

      const body = await res.text();
      const lostTheRace = res.status === 409 && body.includes("23505");
      if (!lostTheRace || attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Supabase append version failed (HTTP ${res.status}): ${body.slice(0, 300)}`
        );
      }
      // Brief jittered backoff so two clients do not lock step.
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
    }
  }

  async update(
    id: string,
    patch: ProjectPatch,
    userId?: string
  ): Promise<Project | null> {
    const current = await this.get(id, userId);
    if (!current) return null;
    const next = applyPatch(current, patch);

    const res = await fetch(
      this.base + "?id=eq." + encodeURIComponent(id) + this.ownerFilter(userId),
      {
        method: "PATCH",
        headers: this.headers({ prefer: "return=minimal" }),
        body: JSON.stringify({
          name: next.name,
          prompt: next.prompt,
          target: next.target,
          code: next.code,
          files: next.files,
          binaries: next.binaries,
          brain: next.brain,
          saved_at: next.savedAt,
        }),
      }
    );
    if (!res.ok) await this.fail("update", res);

    if (!patch.silent) {
      await this.appendVersion(next, versionLabel(patch, next.prompt), userId);
    }
    return next;
  }

  async listVersions(id: string, userId?: string): Promise<VersionSummary[]> {
    // Confirm ownership through the project first — the service key
    // bypasses RLS, so the check has to live here.
    if (!(await this.get(id, userId))) return [];

    const res = await fetch(
      this.versionsBase +
        "?project_id=eq." + encodeURIComponent(id) +
        "&select=version,label,created_at&order=version.desc",
      { headers: this.headers() }
    );
    if (!res.ok) await this.fail("list versions", res);
    const rows = (await res.json()) as Array<Pick<VersionRow, "version" | "label" | "created_at">>;
    return rows.map((r) => ({
      version: r.version,
      label: r.label ?? "Saved",
      createdAt: r.created_at,
    }));
  }

  async getVersion(
    id: string,
    version: number,
    userId?: string
  ): Promise<Project | null> {
    const project = await this.get(id, userId);
    if (!project) return null;

    const res = await fetch(
      this.versionsBase +
        "?project_id=eq." + encodeURIComponent(id) +
        "&version=eq." + encodeURIComponent(String(version)) +
        "&select=*",
      { headers: this.headers() }
    );
    if (!res.ok) await this.fail("get version", res);
    const r = ((await res.json()) as VersionRow[])[0];
    if (!r) return null;
    return {
      id,
      name: project.name,
      prompt: r.prompt,
      target: r.target,
      code: r.code,
      files: r.files ?? [],
      binaries: r.binaries ?? [],
      brain: r.brain ?? {},
      savedAt: r.created_at,
    };
  }

  async restoreVersion(
    id: string,
    version: number,
    userId?: string
  ): Promise<Project | null> {
    const snapshot = await this.getVersion(id, version, userId);
    if (!snapshot) return null;
    // Append-only: the restore becomes a NEW version, so it can itself
    // be undone.
    return this.update(
      id,
      {
        prompt: snapshot.prompt,
        target: snapshot.target,
        code: snapshot.code,
        files: snapshot.files,
        binaries: snapshot.binaries,
        label: `Restored version ${version}`,
      },
      userId
    );
  }
}
