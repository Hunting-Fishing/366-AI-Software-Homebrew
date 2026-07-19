// Project storage behind an interface (Decision D6).
// Today: JSON files on disk — zero setup, perfect for one team.
// Phase 3: implement this same interface with Postgres/Prisma
// and swap it in server wiring; nothing else changes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface Project {
  id: string;
  name: string;
  prompt: string;
  /** Language target this project was generated for (web, flutter, python…). */
  target: string;
  /** Single-file targets (web). */
  code: string;
  /** Multi-file targets (flutter, python). */
  files: ProjectFile[];
  /** Generated binary assets (e.g. game art PNGs), base64. */
  binaries: Array<{ path: string; b64: string }>;
  savedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  savedAt: string;
}

export interface ProjectStore {
  save(
    name: string,
    prompt: string,
    code: string,
    target?: string,
    files?: ProjectFile[],
    binaries?: Array<{ path: string; b64: string }>,
    /** Owner account id (accounts mode, Phase 3.3). Undefined = local single-user mode. */
    userId?: string
  ): Promise<Project>;
  list(userId?: string): Promise<ProjectSummary[]>;
  get(id: string, userId?: string): Promise<Project | null>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class JsonProjectStore implements ProjectStore {
  private dir: string;

  constructor(dir = path.join(__dirname, "..", "..", "projects")) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  async save(
    name: string,
    prompt: string,
    code: string,
    target = "web",
    files: ProjectFile[] = [],
    binaries: Array<{ path: string; b64: string }> = [],
    _userId?: string // local JSON mode is single-user; ignored
  ): Promise<Project> {
    const id =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) +
      "-" +
      Date.now();
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
    fs.writeFileSync(
      path.join(this.dir, id + ".json"),
      JSON.stringify(project, null, 2)
    );
    return project;
  }

  async list(_userId?: string): Promise<ProjectSummary[]> {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const p = JSON.parse(
          fs.readFileSync(path.join(this.dir, f), "utf8")
        ) as Project;
        return { id: p.id, name: p.name, savedAt: p.savedAt };
      })
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  async get(id: string, _userId?: string): Promise<Project | null> {
    const file = path.join(this.dir, path.basename(id) + ".json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as Project;
  }
}
