// One-click publish: deploy generated apps to the public web via
// Netlify's API (free tier). Uses Netlify's file-digest flow so we
// need zero extra dependencies — just fetch + built-in crypto.
//
// Setup (one time): get a free personal access token at
// app.netlify.com → User settings → Applications → New access token,
// then add NETLIFY_TOKEN=... to .env and restart.

import crypto from "node:crypto";
import type { ProjectFile } from "../lib/files.js";

const API = "https://api.netlify.com/api/v1";

export function sha1(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

export function slugify(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

async function fail(step: string, res: Response): Promise<never> {
  const body = (await res.text()).slice(0, 300);
  throw new Error(`Netlify ${step} failed (HTTP ${res.status}): ${body}`);
}

export async function deploySite(
  name: string,
  files: ProjectFile[]
): Promise<{ url: string }> {
  const token = process.env.NETLIFY_TOKEN;
  if (!token) {
    throw new Error(
      "No NETLIFY_TOKEN set. Get a free token at app.netlify.com → User settings → " +
        "Applications → New access token, add NETLIFY_TOKEN=... to your .env file, and restart."
    );
  }
  const auth = { authorization: `Bearer ${token}` };
  const json = { ...auth, "content-type": "application/json" };

  // 1. Create the site.
  const slug = slugify(name || "my-app");
  const siteRes = await fetch(`${API}/sites`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ name: slug }),
  });
  if (!siteRes.ok) await fail("site creation", siteRes);
  const site = (await siteRes.json()) as { id: string; ssl_url?: string; url?: string };

  // 2. Announce the deploy with a digest of every file.
  const digest: Record<string, string> = {};
  for (const f of files) digest["/" + f.path] = sha1(f.content);
  const depRes = await fetch(`${API}/sites/${site.id}/deploys`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ files: digest }),
  });
  if (!depRes.ok) await fail("deploy creation", depRes);
  const deploy = (await depRes.json()) as { id: string; required?: string[] };

  // 3. Upload the files Netlify says it needs.
  const required = new Set(deploy.required ?? Object.values(digest));
  for (const f of files) {
    const sha = digest["/" + f.path];
    if (!sha || !required.has(sha)) continue;
    const upRes = await fetch(
      `${API}/deploys/${deploy.id}/files/${encodeURIComponent(f.path)}`,
      {
        method: "PUT",
        headers: { ...auth, "content-type": "application/octet-stream" },
        body: f.content,
      }
    );
    if (!upRes.ok) await fail(`upload of ${f.path}`, upRes);
  }

  return { url: site.ssl_url || site.url || `https://${slug}.netlify.app` };
}
