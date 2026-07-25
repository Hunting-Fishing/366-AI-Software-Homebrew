// Project storage behind an interface (Decision D6).
// Two implementations: JSON files on disk (zero setup, single user) and
// Supabase Postgres (services/supabase.ts). Nothing outside this
// interface knows which one is running.
//
// VERSION HISTORY (Phase 1.5)
// Every write to a project appends an immutable snapshot. Restoring
// does not delete anything — it copies an old snapshot forward as a
// NEW version, so history is append-only and you can undo an undo.
// That property is the whole point: an edit forty prompts deep can
// quietly break something from prompt twelve, and re-prompting your way
// back out is worse than rolling back.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ProjectFile {
  path: string;
  content: string;
}

export type Binary = { path: string; b64: string };

export interface Project {
  id: string;
  name: string;
  prompt: string;
  /** Language target this project was generated for (web, flutter, python…). */
  target: string;
  /** Single-file targets (web). */
  code: string;
  /** Multi-file targets (flutter, python, react…). */
  files: ProjectFile[];
  /** Generated binary assets (e.g. game art PNGs), base64. */
  binaries: Binary[];
  savedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  savedAt: string;
}

/** What changes on a save. Everything optional — omitted fields are kept. */
export interface ProjectPatch {
  name?: string;
  prompt?: string;
  target?: string;
  code?: string;
  files?: ProjectFile[];
  binaries?: Binary[];
  /** Shown in the history list. Defaults to the prompt that produced it. */
  label?: string;
}

export interface VersionSummary {
  version: number;
  label: string;
  createdAt: string;
}

export interface ProjectStore {
  save(
    name: string,
    prompt: string,
    code: string,
    target?: string,
    files?: ProjectFile[],
    binaries?: Binary[],
    /** Owner account id (accounts mode, Phase 3.3). Undefined = local single-user mode. */
    userId?: string
  ): Promise<Project>;
  list(userId?: string): Promise<ProjectSummary[]>;
  get(id: string, userId?: string): Promise<Project | null>;

  /** Overwrite an existing project and append a version. */
  update(id: string, patch: ProjectPatch, userId?: string): Promise<Project | null>;
  /** Newest first. */
  listVersions(id: string, userId?: string): Promise<VersionSummary[]>;
  getVersion(id: string, version: number, userId?: string): Promise<Project | null>;
  /** Copy an old version forward as the current state, and as a new version. */
  restoreVersion(id: string, version: number, userId?: string): Promise<Project | null>;
}

/** Shared: build a stable, filesystem-safe id from a project name. */
export function makeProjectId(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-" + Date.now()
  );
}

/** Shared: apply a patch to a project, leaving omitted fields untouched. */
export function applyPatch(current: Project, patch: ProjectPatch): Project {
  return {
    ...current,
    name: patch.name ?? current.name,
    prompt: patch.prompt ?? current.prompt,
    target: patch.target ?? current.target,
    code: patch.code ?? current.code,
    files: patch.files ?? current.files,
    binaries: patch.binaries ?? current.binaries,
    savedAt: new Date().toISOString(),
  };
}

/** Shared: the label a version shows in the history list. */
export function versionLabel(patch: ProjectPatch, fallbackPrompt: string): string {
  const raw = (patch.label ?? patch.prompt ?? fallbackPrompt ?? "").trim();
  if (!raw) return "Saved";
  return raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface StoredVersion extends VersionSummary {
  project: Project;
}

export class JsonProjectStore implements ProjectStore {
  private dir: string;

  constructor(dir = path.join(__dirname, "..", "..", "projects")) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string): string {
    return path.join(this.dir, path.basename(id) + ".json");
  }

  private versionsFile(id: string): string {
    return path.join(this.dir, path.basename(id) + ".versions.json");
  }

  private readVersions(id: string): StoredVersion[] {
    const f = this.versionsFile(id);
    if (!fs.existsSync(f)) return [];
    try {
      return JSON.parse(fs.readFileSync(f, "utf8")) as StoredVersion[];
    } catch {
      // A corrupt history file must never make the project unreadable.
      return [];
    }
  }

  private appendVersion(id: string, project: Project, label: string): void {
    const versions = this.readVersions(id);
    versions.push({
      version: versions.length + 1,
      label,
      createdAt: project.savedAt,
      project,
    });
    fs.writeFileSync(this.versionsFile(id), JSON.stringify(versions, null, 2));
  }

  async save(
    name: string,
    prompt: string,
    code: string,
    target = "web",
    files: ProjectFile[] = [],
    binaries: Binary[] = [],
    _userId?: string // local JSON mode is single-user; ignored
  ): Promise<Project> {
    const id = makeProjectId(name);
    const project: Project = {
      id,
      name,
      prompt,
      target,
      code,
      files,
      binaries,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.file(id), JSON.stringify(project, null, 2));
    this.appendVersion(id, project, versionLabel({}, prompt));
    return project;
  }

  async list(_userId?: string): Promise<ProjectSummary[]> {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".versions.json"))
      .map((f) => {
        const p = JSON.parse(
          fs.readFileSync(path.join(this.dir, f), "utf8")
        ) as Project;
        return { id: p.id, name: p.name, savedAt: p.savedAt };
      })
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  async get(id: string, _userId?: string): Promise<Project | null> {
    const f = this.file(id);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, "utf8")) as Project;
  }

  async update(id: string, patch: ProjectPatch, _userId?: string): Promise<Project | null> {
    const current = await this.get(id);
    if (!current) return null;
    const next = applyPatch(current, patch);
    fs.writeFileSync(this.file(id), JSON.stringify(next, null, 2));
    this.appendVersion(id, next, versionLabel(patch, next.prompt));
    return next;
  }

  async listVersions(id: string, _userId?: string): Promise<VersionSummary[]> {
    return this.readVersions(id)
      .map(({ version, label, createdAt }) => ({ version, label, createdAt }))
      .sort((a, b) => b.version - a.version);
  }

  async getVersion(id: string, version: number, _userId?: string): Promise<Project | null> {
    return this.readVersions(id).find((v) => v.version === version)?.project ?? null;
  }

  async restoreVersion(id: string, version: number, userId?: string): Promise<Project | null> {
    const snapshot = await this.getVersion(id, version);
    if (!snapshot) return null;
    return this.update(
      id,
      {
        name: snapshot.name,
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
