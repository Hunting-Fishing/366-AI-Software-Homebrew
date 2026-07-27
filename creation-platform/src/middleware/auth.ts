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
const PAGE_STYLE = `:root{color-scheme:dark;--ink:#f7f7fb;--muted:#a7a8b7;--violet:#8b5cf6;--blue:#5367ff;--line:rgba(255,255,255,.1);--panel:rgba(18,19,29,.8)}
*{box-sizing:border-box}
html{background:#08090f}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#08090f;color:var(--ink);min-height:100vh;min-height:100dvh;margin:0;-webkit-text-size-adjust:100%;overflow-x:hidden}
button,input{font:inherit}
button{cursor:pointer}
.shell{position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,1.12fr) minmax(420px,.88fr);min-height:100vh;min-height:100dvh;overflow:hidden}
.glow{position:absolute;z-index:-2;border-radius:999px;filter:blur(100px);pointer-events:none;opacity:.42}
.glow.one{width:520px;height:520px;background:#5424d6;top:-240px;left:24%}
.glow.two{width:480px;height:480px;background:#174bd5;right:-250px;bottom:-240px;opacity:.3}
.noise{position:absolute;inset:0;z-index:-1;opacity:.028;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.9'/%3E%3C/svg%3E")}
.story{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:46px clamp(38px,6vw,96px) 52px;min-height:100vh;min-height:100dvh;border-right:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:12px;color:#fff;text-decoration:none;font-size:15px;font-weight:750;letter-spacing:-.01em;width:max-content}
.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:linear-gradient(145deg,#5d6cff,#9a4cf1);box-shadow:0 10px 35px rgba(112,78,255,.38);font-size:19px}
.brand small{display:block;color:#828598;font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;margin-top:2px}
.hero{max-width:720px;margin:60px 0}
.eyebrow{display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(140,115,255,.28);background:rgba(116,83,255,.09);border-radius:999px;color:#c9bcff;font-size:12px;font-weight:650;letter-spacing:.04em;text-transform:uppercase}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:#9d7cff;box-shadow:0 0 16px #9d7cff}
h1{font-size:clamp(48px,6vw,86px);line-height:.96;letter-spacing:-.065em;margin:24px 0 24px;max-width:780px}
h1 span{display:block;background:linear-gradient(100deg,#fff 5%,#acb5ff 48%,#b979f5 95%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{max-width:610px;color:#b5b6c4;font-size:clamp(17px,1.55vw,21px);line-height:1.62;margin:0}
.capabilities{display:flex;flex-wrap:wrap;gap:9px;margin-top:34px}
.cap{display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.035);color:#d6d6df;font-size:13px}
.cap b{color:#9d8cff;font-size:11px}
.proof{display:flex;align-items:center;gap:20px;color:#858797;font-size:12px}
.proof strong{color:#d9dae3;font-size:13px}
.proof-line{width:46px;height:1px;background:linear-gradient(90deg,#6b5cff,transparent)}
.auth-side{display:flex;align-items:center;justify-content:center;padding:40px clamp(24px,5vw,78px)}
form{position:relative;width:100%;max-width:470px;padding:42px;border:1px solid rgba(255,255,255,.115);border-radius:24px;background:linear-gradient(145deg,rgba(28,29,43,.9),rgba(15,16,25,.82));box-shadow:0 36px 90px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.045);backdrop-filter:blur(24px)}
.form-top{margin-bottom:28px}
.form-top h2{font-size:30px;line-height:1.15;letter-spacing:-.035em;margin:0 0 9px}
.form-top p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px;background:rgba(5,6,10,.58);border:1px solid rgba(255,255,255,.07);border-radius:12px;margin-bottom:22px}
.tabs button{width:100%;min-height:43px;border:0;border-radius:8px;background:transparent;color:#898b9d;font-size:14px;font-weight:650;transition:.2s ease}
.tabs button:hover{color:#fff}
.tabs button.on{color:#fff;background:#242636;box-shadow:0 5px 15px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.07)}
.field{display:block;margin:0 0 15px;text-align:left}
.field-label{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;color:#c7c8d3;font-size:12px;font-weight:650}
.field-label a{color:#9f8cff;text-decoration:none;font-weight:600}
.input-wrap{position:relative}
input{display:block;width:100%;min-height:54px;padding:0 15px;border:1px solid rgba(255,255,255,.11);border-radius:11px;background:rgba(7,8,14,.65);color:#fff;font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
input::placeholder{color:#66697c}
input:hover{border-color:rgba(255,255,255,.2)}
input:focus{border-color:#7e72ff;background:rgba(10,11,19,.9);box-shadow:0 0 0 4px rgba(104,92,255,.13)}
.password-input{padding-right:52px}
.reveal{position:absolute;right:7px;top:7px;width:40px;height:40px;border:0;border-radius:8px;background:transparent;color:#878a9b;font-size:17px}
.reveal:hover{color:#fff;background:rgba(255,255,255,.06)}
.submit{position:relative;width:100%;min-height:54px;margin-top:5px;border:0;border-radius:11px;overflow:hidden;background:linear-gradient(100deg,#5266ff,#8c50f5);color:#fff;font-size:15px;font-weight:750;box-shadow:0 13px 34px rgba(91,77,242,.28);transition:transform .2s,box-shadow .2s,filter .2s}
.submit:before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.25) 45%,transparent 70%);transform:translateX(-120%);transition:transform .65s}
.submit:hover{transform:translateY(-2px);box-shadow:0 17px 42px rgba(91,77,242,.4);filter:saturate(1.12)}
.submit:hover:before{transform:translateX(120%)}
.submit:focus-visible,.tabs button:focus-visible,.reveal:focus-visible,.brand-home:focus-visible{outline:2px solid #aaa2ff;outline-offset:3px}
.submit:disabled{cursor:wait;opacity:.72;transform:none}
p.err,p.ok{font-size:13px;line-height:1.45;min-height:19px;margin:12px 0 0;text-align:left}
p.err{color:#ff9aaa}
p.ok{color:#75dca3}
.terms{color:#686b7d;font-size:11px;line-height:1.55;margin:20px 0 0;text-align:center}
.brand-home{display:block;margin-top:22px;color:#8e91a3;font-size:12px;text-align:center;text-decoration:none}
.brand-home:hover{color:#fff}
.mobile-brand{display:none}
@media(max-width:900px){
.shell{display:block;padding:0}
.story{display:none}
.auth-side{position:relative;min-height:100vh;min-height:100dvh;padding:28px 18px}
.mobile-brand{display:flex;position:absolute;top:24px;left:24px}
form{margin-top:68px;padding:30px 24px;border-radius:20px;max-width:480px}
}
@media(max-width:430px){
.auth-side{align-items:flex-start;padding:20px 14px 28px}
.mobile-brand{top:20px;left:18px}
form{padding:26px 18px;margin-top:64px}
.form-top h2{font-size:26px}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}`;

const PAGE_OPEN = `<div class="shell"><div class="glow one"></div><div class="glow two"></div><div class="noise"></div>
<section class="story">
  <a class="brand" href="https://366industries.com/ai-designer"><span class="mark">⚡</span><span>366 AI Designer<small>by 366 Industries</small></span></a>
  <div class="hero">
    <div class="eyebrow"><i></i> Your idea. Built for real.</div>
    <h1>From one prompt<br><span>to production.</span></h1>
    <p class="lede">Create websites, mobile apps, games and software through conversation. Keep your source code. Build without boundaries.</p>
    <div class="capabilities">
      <span class="cap"><b>◆</b> React</span><span class="cap"><b>◆</b> Flutter</span><span class="cap"><b>◆</b> Full-stack</span><span class="cap"><b>◆</b> Games</span><span class="cap"><b>◆</b> AI-powered</span>
    </div>
  </div>
  <div class="proof"><span class="proof-line"></span><strong>One workspace. Every platform.</strong><span>Own everything you create.</span></div>
</section>
<main class="auth-side">
  <a class="brand mobile-brand" href="https://366industries.com/ai-designer"><span class="mark">⚡</span><span>366 AI Designer<small>by 366 Industries</small></span></a>`;

const PASSWORD_REVEAL = `<button class="reveal" type="button" aria-label="Show password" onclick="revealPassword(this)">◉</button>`;

const PAGE_SCRIPT = `function revealPassword(b){const p=document.getElementById("pw"),show=p.type==="password";p.type=show?"text":"password";b.textContent=show?"◎":"◉";b.setAttribute("aria-label",show?"Hide password":"Show password")}`;

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#08090f"><title>366 AI Designer — Private access</title>
<style>${PAGE_STYLE}</style></head>
<body>${PAGE_OPEN}<form onsubmit="return go(event)"><div class="form-top"><h2>Enter the build studio</h2><p>Private access for the 366 development team.</p></div>
<label class="field"><span class="field-label">Team password</span><span class="input-wrap"><input class="password-input" type="password" id="pw" name="password" autocomplete="current-password" placeholder="Enter your access password" autofocus>${PASSWORD_REVEAL}</span></label>
<button class="submit" id="goBtn">Enter AI Designer →</button><p class="err" id="err" role="alert"></p><p class="terms">Authorized team members only. Your session is protected using a secure, HTTP-only cookie.</p><a class="brand-home" href="https://366industries.com/ai-designer">← Back to 366 Industries</a></form></main></div>
<script>${PAGE_SCRIPT};async function go(e){e.preventDefault();const b=document.getElementById("goBtn");b.disabled=true;b.textContent="Opening your workspace…";
const r=await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:document.getElementById("pw").value})});
if(r.ok)location.reload();else{document.getElementById("err").textContent="That password is not correct. Try again.";b.disabled=false;b.textContent="Enter AI Designer →"}return false;}</script></body></html>`;

// ---- accounts mode page (login / sign up tabs) --------------------

const ACCOUNT_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#08090f"><title>366 AI Designer — Sign in</title>
<style>${PAGE_STYLE}</style></head>
<body>${PAGE_OPEN}<form onsubmit="return go(event)"><div class="form-top"><h2 id="formTitle">Welcome back</h2><p id="formCopy">Sign in to continue building your next big idea.</p></div>
<div class="tabs"><button type="button" id="tabIn" class="on" onclick="mode('in')">Sign in</button><button type="button" id="tabUp" onclick="mode('up')">Create account</button></div>
<label class="field" id="nameField" style="display:none"><span class="field-label">Your name</span><input type="text" id="name" name="name" autocomplete="name" placeholder="How should we address you?"></label>
<label class="field"><span class="field-label">Email address</span><input type="email" id="email" name="username" autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="you@company.com" autofocus></label>
<label class="field"><span class="field-label">Password <span id="minHint"></span></span><span class="input-wrap"><input class="password-input" type="password" id="pw" name="password" autocomplete="current-password" placeholder="Enter your password">${PASSWORD_REVEAL}</span></label>
<button class="submit" id="goBtn">Open my workspace →</button><p class="err" id="err" role="alert"></p><p class="ok" id="ok" role="status"></p><p class="terms">By continuing, you agree to use 366 AI Designer responsibly and protect your account credentials.</p><a class="brand-home" href="https://366industries.com/ai-designer">← Back to 366 Industries</a></form></main></div>
<script>
${PAGE_SCRIPT};
let m="in";
function mode(x){m=x;document.getElementById("tabIn").className=x==="in"?"on":"";document.getElementById("tabUp").className=x==="up"?"on":"";
document.getElementById("nameField").style.display=x==="up"?"block":"none";
document.getElementById("formTitle").textContent=x==="in"?"Welcome back":"Build what comes next";
document.getElementById("formCopy").textContent=x==="in"?"Sign in to continue building your next big idea.":"Create your workspace and turn an idea into working software.";
document.getElementById("minHint").textContent=x==="up"?"· 6+ characters":"";
document.getElementById("goBtn").textContent=x==="in"?"Open my workspace →":"Create my workspace →";
/* Tell the password manager which it is, so it offers "fill" when
   signing in and "suggest a strong password" when signing up. */
document.getElementById("pw").setAttribute("autocomplete",x==="in"?"current-password":"new-password");
document.getElementById("err").textContent="";document.getElementById("ok").textContent="";}
async function go(e){e.preventDefault();
const err=document.getElementById("err"),ok=document.getElementById("ok"),btn=document.getElementById("goBtn");err.textContent="";ok.textContent="";btn.disabled=true;btn.textContent=m==="in"?"Opening your workspace…":"Creating your workspace…";
const body={email:document.getElementById("email").value.trim(),password:document.getElementById("pw").value};
if(m==="up")body.displayName=document.getElementById("name").value.trim();
const r=await fetch(m==="in"?"/api/auth/login":"/api/auth/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const d=await r.json().catch(()=>({}));
if(r.ok&&d.needsConfirmation){ok.textContent="Account created! Check your email to confirm, then sign in.";mode("in");}
else if(r.ok)location.reload();
else{err.textContent=d.error||"Something went wrong. Please try again.";btn.disabled=false;btn.textContent=m==="in"?"Open my workspace →":"Create my workspace →";}
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
