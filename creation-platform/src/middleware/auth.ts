// Password gate for online deployments.
//
// - No ACCESS_PASSWORD in .env → open mode (local use, unchanged).
// - ACCESS_PASSWORD set → every request needs the login cookie.
//   Browsers get a login page; API calls get a 401.
//
// This is team-grade protection (one shared password), the right
// size for "ourselves online". Real per-user accounts are the
// Phase 3 milestone in docs/PHASES.md.

import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE = "cp_auth";

function expectedToken(pw: string): string {
  return crypto.createHash("sha256").update("creation-platform:" + pw).digest("hex");
}

const LOGIN_PAGE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Creation Platform — Login</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1117;color:#e8eaf0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
form{background:#181b24;border:1px solid #2a2f3f;border-radius:14px;padding:32px;width:320px;text-align:center}
h1{font-size:18px;background:linear-gradient(90deg,#6c7bff,#8a5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
input,button{width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:8px;border:1px solid #2a2f3f;margin-top:12px}
input{background:#1f2330;color:#e8eaf0}button{background:linear-gradient(90deg,#6c7bff,#8a5cf6);border:none;color:#fff;font-weight:600;cursor:pointer}
p.err{color:#ff9db0;font-size:13px;min-height:16px}</style></head>
<body><form onsubmit="return go(event)"><h1>⚡ Creation Platform</h1>
<input type="password" id="pw" placeholder="Team password" autofocus>
<button>Enter</button><p class="err" id="err"></p></form>
<script>async function go(e){e.preventDefault();
const r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:document.getElementById("pw").value})});
if(r.ok)location.reload();else document.getElementById("err").textContent="Wrong password";return false;}</script></body></html>`;

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pw = process.env.ACCESS_PASSWORD;
  if (!pw) {
    next(); // open mode for local use
    return;
  }
  if (req.path === "/api/login") {
    next();
    return;
  }
  const cookieHeader = req.headers.cookie ?? "";
  const cookie = cookieHeader
    .split(/;\s*/)
    .find((c) => c.startsWith(COOKIE + "="));
  if (cookie?.slice(COOKIE.length + 1) === expectedToken(pw)) {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.status(401).type("html").send(LOGIN_PAGE);
}

export function loginHandler(req: Request, res: Response): void {
  const pw = process.env.ACCESS_PASSWORD;
  if (!pw) {
    res.json({ ok: true });
    return;
  }
  const { password } = req.body as { password?: string };
  if (password === pw) {
    res.setHeader(
      "set-cookie",
      `${COOKIE}=${expectedToken(pw)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`
    );
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
}
