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

// Shared by both gate pages. These are the FIRST thing anyone sees on a
// phone, so they carry the same mobile fixes as public/index.html:
//   - 100dvh, because mobile browsers count the address bar in 100vh
//   - fluid width, so the card never touches the screen edges
//   - accents darkened to #4f61ff / #8556f6, because white on the old
//     #6c7bff measured 3.55:1 and failed WCAG AA
//   - 16px inputs, or iOS zooms the page on focus and the layout jumps
//   - safe-area padding for notched devices
const PAGE_STYLE = `*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;margin:0;padding:24px calc(16px + env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-right));-webkit-text-size-adjust:100%}
form{background:#181b24;border:1px solid #2a2f3f;border-radius:14px;padding:28px 24px;width:100%;max-width:340px;text-align:center}
h1{font-size:18px;margin:0 0 4px;background:linear-gradient(90deg,#4f61ff,#8556f6);-webkit-background-clip:text;background-clip:text;color:transparent}
input,button{width:100%;font:inherit;font-size:16px;padding:12px;border-radius:8px;border:1px solid #2a2f3f;margin-top:12px;min-height:48px}
input{background:#1f2330;color:#e8eaf0}
input:focus,button:focus-visible{outline:2px solid #8b97ff;outline-offset:2px}
button{background:linear-gradient(90deg,#4f61ff,#8556f6);border:none;color:#fff;font-weight:600;cursor:pointer}
p.err{color:#ff9db0;font-size:14px;min-height:18px;margin:12px 0 0}
p.ok{color:#8fe3b0;font-size:14px;min-height:18px;margin:8px 0 0}
.tabs{display:flex;gap:8px;margin-bottom:4px}
.tabs button{margin-top:12px;background:#1f2330;border:1px solid #2a2f3f;color:#aab;font-weight:500}
.tabs button.on{background:linear-gradient(90deg,#4f61ff,#8556f6);border:none;color:#fff;font-weight:600}`;

const LOGIN_PAGE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Creation Platform — Login</title>
<style>${PAGE_STYLE}</style></head>
<body><form onsubmit="return go(event)"><h1>⚡ Creation Platform</h1>
<input type="password" id="pw" name="password" autocomplete="current-password" placeholder="Team password" autofocus>
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
<input type="text" id="name" name="name" autocomplete="name" placeholder="Display name" style="display:none">
<input type="email" id="email" name="username" autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Email" autofocus>
<input type="password" id="pw" name="password" autocomplete="current-password" placeholder="Password (min 6 characters)">
<button id="goBtn">Sign in</button><p class="err" id="err"></p><p class="ok" id="ok"></p></form>
<script>
let m="in";
function mode(x){m=x;document.getElementById("tabIn").className=x==="in"?"on":"";document.getElementById("tabUp").className=x==="up"?"on":"";
document.getElementById("name").style.display=x==="up"?"block":"none";
document.getElementById("goBtn").textContent=x==="in"?"Sign in":"Create account";
/* Tell the password manager which it is, so it offers "fill" when
   signing in and "suggest a strong password" when signing up. */
document.getElementById("pw").setAttribute("autocomplete",x==="in"?"current-password":"new-password");
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

/**
 * The one path that is never gated, in any mode.
 *
 * Render (and every other platform health check) polls an endpoint and
 * marks the service unhealthy on any non-2xx. With ACCESS_PASSWORD set
 * — which is exactly how this is deployed — every other path including
 * "/" correctly returns 401, so pointing a health check at them puts
 * the service into a restart loop.
 *
 * /healthz deliberately returns nothing but {"ok":true}. /api/health
 * stays behind auth because it reports which providers are configured.
 */
const PUBLIC_HEALTH_PATH = "/healthz";

/**
 * The preview is served under /live/<token>/ and carries its own
 * credential in that path.
 *
 * It cannot use the session cookie. The preview iframe is sandboxed
 * without allow-same-origin so that generated code cannot reach the
 * platform, and that gives the frame an opaque origin — which sends no
 * cookies at all. Left behind this middleware, every module the app
 * imports came back 401 and the preview never ran.
 *
 * So the route is exempt here and validates its own token instead
 * (routes/live.ts). A wrong or stale token is a 404, and the token
 * rotates on every build.
 */
const PREVIEW_PREFIX = "/live/";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.path === PUBLIC_HEALTH_PATH || req.path.startsWith(PREVIEW_PREFIX)) {
    next();
    return;
  }

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
