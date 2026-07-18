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
    files?: ProjectFile[]
  ): Project;
  list(): ProjectSummary[];
  get(id: string): Project | null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class JsonProjectStore implements ProjectStore {
  private dir: string;

  constructor(dir = path.join(__dirname, "..", "..", "projects")) {
    this.dir = dir;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  save(
    name: string,
    prompt: string,
    code: string,
    target = "web",
    files: ProjectFile[] = []
  ): Project {
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
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(this.dir, id + ".json"),
      JSON.stringify(project, null, 2)
    );
    return project;
  }

  list(): ProjectSummary[] {
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

  get(id: string): Project | null {
    const file = path.join(this.dir, path.basename(id) + ".json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as Project;
  }
}
