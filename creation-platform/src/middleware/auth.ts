// Access control, three modes (checked in this order):
//
// 1. ACCOUNTS mode — SUPABASE_URL + SUPABASE_ANON_KEY in .env:
//    real per-user accounts (Supabase Auth, Phase 3.3). Every
//    request needs a valid session cookie; browsers get a
//    login/sign-up page, API calls get 401. Expired sessions are
//    refreshed silently with the refresh-token cookie.
// 2. PASSWORD mode — only ACCESS_PASSWORD set: the Phase 3.1 team
//    gate (one shared password), unchanged.
// 3. OPEN mode — neither set: no gate (local use, unchanged).

import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import {
  accountsEnabled,
  verifyToken,
  refreshSession,
  type AuthUser,
} from "../services/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set in accounts mode after a session is verified. */
      user?: AuthUser;
    }
  }
}

const COOKIE = "cp_auth"; // legacy password mode
export const ACCESS_COOKIE = "cp_at";
export const REFRESH_COOKIE = "cp_rt";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  const found = header.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : undefined;
}

function cookieAttrs(req: Request, maxAgeSec: number): string {
  const secure =
    req.secure || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

export function setSessionCookies(
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string
): void {
  res.appendHeader(
    "set-cookie",
    `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}${cookieAttrs(req, 60 * 60 * 24 * 7)}`
  );
  res.appendHeader(
    "set-cookie",
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}${cookieAttrs(req, 60 * 60 * 24 * 30)}`
  );
}

export function clearSessionCookies(req: Request, res: Response): void {
  res.appendHeader("set-cookie", `${ACCESS_COOKIE}=${cookieAttrs(req, 0)}`);
  res.appendHeader("set-cookie", `${REFRESH_COOKIE}=${cookieAttrs(req, 0)}`);
}

// ---- legacy password mode -----------------------------------------

function expectedToken(pw: string): string {
  return crypto.createHash("sha256").update("creation-platform:" + pw).digest("hex");
}

const PAGE_STYLE = `body{font-family:system-ui,sans-serif;background:#0f1117;color:#e8eaf0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
form{background:#181b24;border:1px solid #2a2f3f;border-radius:14px;padding:32px;width:320px;text-align:center}
h1{font-size:18px;background:linear-gradient(90deg,#6c7bff,#8a5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
input,button{width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:8px;border:1px solid #2a2f3f;margin-top:12px}
input{background:#1f2330;color:#e8eaf0}button{background:linear-gradient(90deg,#6c7bff,#8a5cf6);border:none;color:#fff;font-weight:600;cursor:pointer}
p.err{color:#ff9db0;font-size:13px;min-height:16px}p.ok{color:#8fe3b0;font-size:13px;min-height:16px}
.tabs{display:flex;gap:8px;margin-bottom:4px}.tabs button{margin-top:0;background:#1f2330;border:1px solid #2a2f3f;color:#aab;font-weight:500}
.tabs button.on{background:linear-gradient(90deg,#6c7bff,#8a5cf6);border:none;color:#fff;font-weight:600}`;

const LOGIN_PAGE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Creation Platform — Login</title>
<style>${PAGE_STYLE}</style></head>
<body><form onsubmit="return go(event)"><h1>⚡ Creation Platform</h1>
<input type="password" id="pw" placeholder="Team password" autofocus>
<button>Enter</button><p class="err" id="err"></p></form>
<script>async function go(e){e.preventDefault();
const r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:document.getElementById("pw").value})});
if(r.ok)location.reload();else document.getElementById("err").textContent="Wrong password";return false;}</script></body></html>`;

// ---- accounts mode page (login / sign up tabs) --------------------

const ACCOUNT_PAGE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Creation Platform — Sign in</title>
<style>${PAGE_STYLE}</style></head>
<body><form onsubmit="return go(event)"><h1>⚡ Creation Platform</h1>
<div class="tabs"><button type="button" id="tabIn" class="on" onclick="mode('in')">Sign in</button><button type="button" id="tabUp" onclick="mode('up')">Create account</button></div>
<input type="text" id="name" placeholder="Display name" style="display:none">
<input type="email" id="email" placeholder="Email" autofocus>
<input type="password" id="pw" placeholder="Password (min 6 characters)">
<button id="goBtn">Sign in</button><p class="err" id="err"></p><p class="ok" id="ok"></p></form>
<script>
let m="in";
function mode(x){m=x;document.getElementById("tabIn").className=x==="in"?"on":"";document.getElementById("tabUp").className=x==="up"?"on":"";
document.getElementById("name").style.display=x==="up"?"block":"none";
document.getElementById("goBtn").textContent=x==="in"?"Sign in":"Create account";
document.getElementById("err").textContent="";document.getElementById("ok").textContent="";}
async function go(e){e.preventDefault();
const err=document.getElementById("err"),ok=document.getElementById("ok");err.textContent="";ok.textContent="";
const body={email:document.getElementById("email").value.trim(),password:document.getElementById("pw").value};
if(m==="up")body.displayName=document.getElementById("name").value.trim();
const r=await fetch(m==="in"?"/api/auth/login":"/api/auth/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const d=await r.json().catch(()=>({}));
if(r.ok&&d.needsConfirmation){ok.textContent="Account created! Check your email to confirm, then sign in.";mode("in");}
else if(r.ok)location.reload();
else err.textContent=d.error||"Something went wrong";
return false;}</script></body></html>`;

// ---- the middleware -----------------------------------------------

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Mode 1: real user accounts (Phase 3.3).
  if (accountsEnabled()) {
    if (req.path.startsWith("/api/auth/")) {
      // Never block auth endpoints, but attach the user if the
      // session is valid so /api/auth/me can answer "who am I".
      const access = readCookie(req, ACCESS_COOKIE);
      if (access) {
        const user = await verifyToken(access).catch(() => null);
        if (user) req.user = user;
      }
      next();
      return;
    }
    const access = readCookie(req, ACCESS_COOKIE);
    if (access) {
      const user = await verifyToken(access).catch(() => null);
      if (user) {
        req.user = user;
        next();
        return;
      }
    }
    // Access token missing or expired → try the refresh token once.
    const refresh = readCookie(req, REFRESH_COOKIE);
    if (refresh) {
      try {
        const session = await refreshSession(refresh);
        setSessionCookies(req, res, session.accessToken, session.refreshToken);
        req.user = session.user;
        next();
        return;
      } catch {
        clearSessionCookies(req, res);
      }
    }
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.status(401).type("html").send(ACCOUNT_PAGE);
    return;
  }

  // Mode 2: shared team password (Phase 3.1).
  const pw = process.env.ACCESS_PASSWORD;
  if (!pw) {
    next(); // Mode 3: open (local use)
    return;
  }
  if (req.path === "/api/login") {
    next();
    return;
  }
  const cookie = readCookie(req, COOKIE);
  if (cookie === expectedToken(pw)) {
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
