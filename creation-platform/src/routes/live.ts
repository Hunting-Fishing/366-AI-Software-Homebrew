// Serves the live preview through THIS server's own origin.
//
// The preview process (Flask, or Vite) listens on 127.0.0.1 inside the
// machine running the platform. Pointing the browser straight at that
// address only works when the browser is on the same machine. Deployed,
// 127.0.0.1 is the user's own laptop or phone, so the preview appeared
// broken for everyone except whoever was running it locally.
//
// Everything under /live is forwarded to the preview process and piped
// straight back. Same origin, so it works identically on localhost and
// on a server.
//
// WebSockets are upgraded too — Vite's hot reload uses one, and without
// it the console fills with reconnection errors even though the page
// itself renders.
//
// Deliberately no proxy library. Node's http module does this in a few
// lines, and a dependency here would be one more thing to keep patched.

import { Router, type Request, type Response } from "express";
import http from "node:http";
import type { Duplex } from "node:stream";
import { previewRunner, LIVE_PATH } from "../services/runner.js";
import { webPreview } from "../services/webPreview.js";
import { makeAppDataStore, validCollection, type Record_ } from "../services/appData.js";

const appData = makeAppDataStore();

export const liveRouter = Router();

/**
 * Split /live/<token>/rest into its two parts.
 *
 * The token exists because the preview iframe is sandboxed without
 * allow-same-origin — see services/runner.ts. An opaque origin sends
 * no cookies, so cookie auth cannot work here; the token in the path
 * is the credential instead.
 */
export function splitLive(originalUrl: string): { token: string; path: string } {
  const rest = originalUrl.slice(LIVE_PATH.length).replace(/^\//, "");
  const slash = rest.indexOf("/");
  const token = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "/" : rest.slice(slash);
  // A query string on the bare prefix (/live/<token>?t=…) still means
  // the index, and the cache-buster must not be read as a token.
  const q = token.indexOf("?");
  return q === -1 ? { token, path: path || "/" } : { token: token.slice(0, q), path: "/" };
}

/** Strip the /live prefix — the preview process knows nothing about it. */
export function upstreamPath(originalUrl: string): string {
  return splitLive(originalUrl).path;
}

liveRouter.use(LIVE_PATH, (req: Request, res: Response) => {
  const { token, path: subPath } = splitLive(req.originalUrl);

  if (!previewRunner.accepts(token)) {
    res.status(404).type("text").send("No such preview.");
    return;
  }

  // The frame is cross-origin by design, so every asset it pulls —
  // modules, stylesheets, images — is a CORS request. Without these
  // headers the browser blocks the module fetch and the app never
  // runs, which is precisely what tightening the sandbox caused.
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-methods", "GET, HEAD, OPTIONS");
    res.setHeader("access-control-allow-headers", "*");
    res.status(204).end();
    return;
  }

  // ── Generated-app persistence ────────────────────────────
  // Served from inside the preview's own path so a generated app can
  // reach it with a plain relative fetch: the URL is already
  // CORS-open, and the token already proves which project is asking.
  // Anything else would mean handing generated code a credential.
  if (subPath.startsWith("/__data/")) {
    void handleAppData(req, res, subPath.slice("/__data/".length));
    return;
  }

  // React and mobile projects are held in memory and transpiled on the
  // way out — no process to proxy to. See services/webPreview.ts.
  if (webPreview.loaded) {
    // The base must carry the token too, or every URL the page
    // generates points at a prefix that no longer validates.
    const out = webPreview.serve(subPath, previewRunner.base());
    res.status(out.status).type(out.contentType).send(out.body);
    return;
  }

  const port = previewRunner.port();
  if (!port) {
    res.status(503).type("html").send(
      '<!DOCTYPE html><html><body style="font-family:system-ui;background:#0f1117;color:#8b91a5;' +
        'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
        "<p>No preview is running.<br><small>Generate a project, then press “Run in browser”.</small></p>" +
        "</body></html>"
    );
    return;
  }

  const proxy = http.request(
    {
      host: "127.0.0.1",
      port,
      method: req.method,
      path: upstreamPath(req.originalUrl),
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    }
  );

  proxy.on("error", (err) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(502).type("text").send("Preview is not responding: " + err.message);
  });

  // express.json() has not run for this router (it is mounted first),
  // so the raw body stream is still intact and can be piped.
  req.pipe(proxy);
});

/** Read and parse a JSON request body, with a cap so a runaway app cannot exhaust memory. */
async function readJsonBody(req: Request): Promise<unknown> {
  const LIMIT = 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > LIMIT) {
        reject(new Error("That is too much data for one save. Save in smaller batches."));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(parts).toString("utf8");
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error("The request body was not valid JSON.")); }
    });
    req.on("error", reject);
  });
}

/**
 * GET    /__data/<collection>  → every record
 * POST   /__data/<collection>  → upsert one record or an array
 * DELETE /__data/<collection>?ids=a,b → remove records
 *
 * The project id comes from the running preview, never from the
 * request. A generated app cannot name someone else's project even if
 * it tries, because it is never given the chance to say which one.
 */
async function handleAppData(req: Request, res: Response, collection: string): Promise<void> {
  const name = collection.split("?")[0]?.replace(/\/+$/, "") ?? "";
  if (!validCollection(name)) {
    res.status(400).json({ error: "Bad collection name." });
    return;
  }

  const projectId = previewRunner.projectId();
  if (!projectId) {
    // An unsaved project has nowhere to put anything. Say so plainly —
    // this is the one case a generated app should handle gracefully.
    res.status(409).json({
      error: "This project has not been saved yet, so it has no storage. Save it first.",
    });
    return;
  }

  const userId = previewRunner.ownerId();
  try {
    if (req.method === "GET") {
      res.json(await appData.list(projectId, name, userId));
      return;
    }
    if (req.method === "POST" || req.method === "PUT") {
      // This router is mounted before express.json(), because the
      // proxy below needs the raw body stream intact. So this path
      // reads and parses its own.
      const body = await readJsonBody(req);
      const records = (Array.isArray(body) ? body : [body]) as Record_[];
      const usable = records.filter((r) => r && typeof r === "object" && r.id != null);
      if (usable.length !== records.length) {
        res.status(400).json({ error: "Every record needs an id." });
        return;
      }
      res.json({ saved: await appData.put(projectId, name, usable, userId) });
      return;
    }
    if (req.method === "DELETE") {
      const q = String(req.originalUrl.split("?")[1] ?? "");
      const ids = new URLSearchParams(q).get("ids");
      res.json({
        removed: await appData.remove(projectId, name, ids ? ids.split(",") : [], userId),
      });
      return;
    }
    res.status(405).json({ error: "Method not allowed." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Vite's hot reload opens a WebSocket. Express does not handle upgrades,
 * so this attaches to the HTTP server directly.
 */
export function attachLiveWebSocketProxy(server: http.Server): void {
  server.on("upgrade", (req, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith(LIVE_PATH)) return;

    // The upgrade bypasses Express, so it bypasses the token check in
    // the route above too. Without this it would be the one way into a
    // preview that never proves it is allowed to be there.
    if (!previewRunner.accepts(splitLive(req.url).token)) {
      socket.destroy();
      return;
    }

    const port = previewRunner.port();
    if (!port) {
      socket.destroy();
      return;
    }

    const upstream = http.request({
      host: "127.0.0.1",
      port,
      method: req.method,
      path: upstreamPath(req.url),
      headers: req.headers,
    });

    upstream.on("upgrade", (upRes, upSocket, upHead) => {
      const headers = Object.entries(upRes.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\r\n");
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`);
      if (upHead?.length) upSocket.unshift(upHead);
      upSocket.pipe(socket);
      socket.pipe(upSocket);
    });

    // A failed hot-reload socket must never take the page down with it.
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());

    if (head?.length) upstream.write(head);
    upstream.end();
  });
}
