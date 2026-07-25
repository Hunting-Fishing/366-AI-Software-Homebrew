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

export const liveRouter = Router();

/** Strip the /live prefix — the preview process knows nothing about it. */
export function upstreamPath(originalUrl: string): string {
  const stripped = originalUrl.slice(LIVE_PATH.length);
  return stripped === "" ? "/" : stripped;
}

liveRouter.use(LIVE_PATH, (req: Request, res: Response) => {
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

/**
 * Vite's hot reload opens a WebSocket. Express does not handle upgrades,
 * so this attaches to the HTTP server directly.
 */
export function attachLiveWebSocketProxy(server: http.Server): void {
  server.on("upgrade", (req, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith(LIVE_PATH)) return;

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
