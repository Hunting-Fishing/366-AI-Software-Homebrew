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
const PAGE_STYLE = `:root{color-scheme:light;--ink:#153d3d;--muted:#607c77;--teal:#087f78;--coral:#f18462;--sand:#fff8e9;--line:rgba(20,91,85,.14);--panel:rgba(255,253,246,.88)}
*{box-sizing:border-box}
html{background:#eef9f4}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:linear-gradient(135deg,#fff8e9,#e9f8f3);color:var(--ink);min-height:100vh;min-height:100dvh;margin:0;-webkit-text-size-adjust:100%;overflow-x:hidden}
button,input{font:inherit}
button{cursor:pointer}
.shell{position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,1.16fr) minmax(420px,.84fr);min-height:100vh;min-height:100dvh;overflow:hidden}
.glow{position:absolute;z-index:-2;border-radius:999px;filter:blur(100px);pointer-events:none;opacity:.42}
.glow.one{width:520px;height:520px;background:#ffd89d;top:-240px;left:24%}
.glow.two{width:480px;height:480px;background:#72d8cb;right:-250px;bottom:-240px;opacity:.34}
.noise{position:absolute;inset:0;z-index:-1;opacity:.028;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.9'/%3E%3C/svg%3E")}
.story{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:40px clamp(38px,5.2vw,82px) 40px;min-height:100vh;min-height:100dvh;border-right:1px solid rgba(255,255,255,.28);background:linear-gradient(90deg,rgba(5,63,62,.72),rgba(7,91,86,.28)),url("/assets/366-tropical-auth-hero.png") center/cover no-repeat;color:#fff}
.brand{display:inline-flex;align-items:center;gap:12px;color:#fff;text-decoration:none;font-size:15px;font-weight:750;letter-spacing:-.01em;width:max-content}
.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(145deg,#ffb064,#f27e5f);box-shadow:0 10px 35px rgba(110,55,31,.3);font-size:19px}
.brand small{display:block;color:#828598;font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;margin-top:2px}
.hero{max-width:720px;margin:38px 0 22px}
.eyebrow{display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(255,255,255,.36);background:rgba(255,255,255,.14);backdrop-filter:blur(10px);border-radius:999px;color:#fff8de;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.eyebrow i{width:7px;height:7px;border-radius:50%;background:#ffb66f;box-shadow:0 0 16px #ffd09e}
h1{font-size:clamp(46px,5.4vw,78px);line-height:.96;letter-spacing:-.065em;margin:22px 0 20px;max-width:780px}
h1 span{display:block;background:linear-gradient(100deg,#fff9dc 5%,#ffd29b 52%,#ff9d76 95%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{max-width:610px;color:rgba(255,255,255,.88);font-size:clamp(17px,1.55vw,21px);line-height:1.62;margin:0;text-shadow:0 2px 22px rgba(0,41,41,.34)}
.capabilities{display:flex;flex-wrap:wrap;gap:9px;margin-top:34px}
.cap{display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid rgba(255,255,255,.26);border-radius:999px;background:rgba(2,52,52,.22);backdrop-filter:blur(10px);color:#fff;font-size:13px}
.cap b{color:#ffbd7d;font-size:11px}
.hero-actions{display:flex;align-items:center;gap:11px;margin-top:22px}
.explore,.watch-demo{min-height:43px;padding:0 17px;border-radius:12px;font-size:13px;font-weight:800;transition:.2s ease}
.explore{border:0;background:#fff7df;color:#075d59;box-shadow:0 12px 28px rgba(0,42,40,.22)}
.explore:hover{transform:translateY(-2px);background:#fff}
.watch-demo{border:1px solid rgba(255,255,255,.38);background:rgba(3,54,52,.2);color:#fff;backdrop-filter:blur(10px)}
.watch-demo:hover{background:rgba(255,255,255,.15)}
.mini-showcase{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:680px;margin-top:20px}
.mini-card{display:flex;align-items:center;gap:10px;min-width:0;padding:10px;border:1px solid rgba(255,255,255,.22);border-radius:13px;background:rgba(1,48,47,.3);backdrop-filter:blur(12px);color:#fff}
.mini-icon{display:grid;place-items:center;flex:0 0 35px;height:35px;border-radius:10px;background:linear-gradient(145deg,#ffe0a6,#ff8b68);color:#134c49;font-size:17px}
.mini-card span{min-width:0;font-size:11px;color:rgba(255,255,255,.7)}
.mini-card strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:12px;margin-bottom:2px}
.proof{display:flex;align-items:center;gap:20px;color:rgba(255,255,255,.73);font-size:12px}
.proof strong{color:#fff;font-size:13px}
.proof-line{width:46px;height:1px;background:linear-gradient(90deg,#ffbd7d,transparent)}
.auth-side{display:flex;align-items:center;justify-content:center;padding:40px clamp(24px,5vw,78px)}
form{position:relative;width:100%;max-width:470px;padding:42px;border:1px solid rgba(255,255,255,.9);border-radius:26px;background:linear-gradient(145deg,rgba(255,255,255,.93),rgba(255,250,238,.86));box-shadow:0 32px 90px rgba(32,103,94,.18),inset 0 1px 0 #fff;backdrop-filter:blur(24px)}
.form-top{margin-bottom:28px}
.form-top h2{font-size:30px;line-height:1.15;letter-spacing:-.035em;margin:0 0 9px}
.form-top p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px;background:#edf5f1;border:1px solid var(--line);border-radius:13px;margin-bottom:22px}
.tabs button{width:100%;min-height:43px;border:0;border-radius:9px;background:transparent;color:#68817d;font-size:14px;font-weight:700;transition:.2s ease}
.tabs button:hover{color:var(--teal)}
.tabs button.on{color:#fff;background:linear-gradient(135deg,#087f78,#15a195);box-shadow:0 7px 18px rgba(8,127,120,.22)}
.field{display:block;margin:0 0 15px;text-align:left}
.field-label{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;color:#c7c8d3;font-size:12px;font-weight:650}
.field-label a{color:#9f8cff;text-decoration:none;font-weight:600}
.input-wrap{position:relative}
input{display:block;width:100%;min-height:54px;padding:0 15px;border:1px solid rgba(20,91,85,.18);border-radius:12px;background:rgba(255,255,255,.84);color:#173f3c;font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
input::placeholder{color:#91a39f}
input:hover{border-color:rgba(8,127,120,.4)}
input:focus{border-color:#159a91;background:#fff;box-shadow:0 0 0 4px rgba(21,154,145,.12)}
.password-input{padding-right:52px}
.reveal{position:absolute;right:7px;top:7px;width:40px;height:40px;border:0;border-radius:8px;background:transparent;color:#878a9b;font-size:17px}
.reveal:hover{color:#fff;background:rgba(255,255,255,.06)}
.submit{position:relative;width:100%;min-height:54px;margin-top:5px;border:0;border-radius:12px;overflow:hidden;background:linear-gradient(100deg,#087f78,#16a398);color:#fff;font-size:15px;font-weight:800;box-shadow:0 13px 34px rgba(8,127,120,.25);transition:transform .2s,box-shadow .2s,filter .2s}
.submit:before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.25) 45%,transparent 70%);transform:translateX(-120%);transition:transform .65s}
.submit:hover{transform:translateY(-2px);box-shadow:0 17px 42px rgba(8,127,120,.35);filter:saturate(1.08)}
.submit:hover:before{transform:translateX(120%)}
.submit:focus-visible,.tabs button:focus-visible,.reveal:focus-visible,.brand-home:focus-visible{outline:2px solid #aaa2ff;outline-offset:3px}
.submit:disabled{cursor:wait;opacity:.72;transform:none}
p.err,p.ok{font-size:13px;line-height:1.45;min-height:19px;margin:12px 0 0;text-align:left}
p.err{color:#b74242}
p.ok{color:#087f78}
.terms{color:#78908b;font-size:11px;line-height:1.55;margin:20px 0 0;text-align:center}
.brand-home{display:block;margin-top:22px;color:#557a74;font-size:12px;text-align:center;text-decoration:none}
.brand-home:hover{color:#087f78}
.examples-link{display:block;width:100%;margin:13px 0 0;border:0;background:transparent;color:#087f78;font-size:12px;font-weight:750;text-align:center}
.examples-link:hover{text-decoration:underline}
.showcase{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(4,45,43,.62);backdrop-filter:blur(16px)}
.showcase.open{display:flex}
.showcase-panel{position:relative;width:min(1060px,100%);max-height:min(780px,calc(100dvh - 48px));overflow:auto;padding:34px;border:1px solid rgba(255,255,255,.74);border-radius:28px;background:linear-gradient(145deg,#fffdf6,#eaf8f3);box-shadow:0 36px 100px rgba(2,44,42,.34)}
.showcase-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}
.showcase-kicker{color:#e36f51;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
.showcase h2{margin:5px 0 7px;font-size:clamp(28px,4vw,44px);letter-spacing:-.045em}
.showcase-head p{max-width:620px;margin:0;color:var(--muted);font-size:14px;line-height:1.55}
.showcase-close{flex:0 0 42px;height:42px;border:1px solid var(--line);border-radius:12px;background:#fff;color:#426d68;font-size:22px}
.creation-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}
.creation{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 15px 35px rgba(25,86,80,.08);transition:.22s ease}
.creation:hover{transform:translateY(-4px);box-shadow:0 20px 42px rgba(25,86,80,.15)}
.creation-visual{position:relative;height:142px;overflow:hidden;padding:15px}
.creation-visual:after{content:"";position:absolute;inset:auto -20px -45px;width:140px;height:100px;border-radius:50%;background:rgba(255,255,255,.28);filter:blur(2px)}
.cv-market{background:linear-gradient(135deg,#ffbe74,#f36f67)}
.cv-mobile{background:linear-gradient(135deg,#55c8b8,#0f7778)}
.cv-game{background:linear-gradient(135deg,#8b70dc,#4a3d94)}
.cv-dashboard{background:linear-gradient(135deg,#54a8e8,#315aa8)}
.cv-booking{background:linear-gradient(135deg,#f2bb6e,#d67d52)}
.cv-ai{background:linear-gradient(135deg,#52c9aa,#087c70)}
.mock-window{position:relative;z-index:1;height:100%;padding:10px;border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 12px 24px rgba(28,52,62,.2)}
.mock-bar{width:42%;height:6px;border-radius:10px;background:#164e4b;margin-bottom:9px}
.mock-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.mock-box{height:64px;border-radius:7px;background:linear-gradient(145deg,#edf6f2,#d8eee7)}
.mock-phone{position:relative;z-index:1;width:66px;height:116px;margin:auto;padding:7px;border:4px solid #143f43;border-radius:16px;background:#fff}
.mock-phone div{height:100%;border-radius:8px;background:linear-gradient(#ffe3af 0 35%,#f3f8f5 35%)}
.mock-game{position:relative;z-index:1;display:grid;place-items:center;height:100%;font-size:56px;filter:drop-shadow(0 12px 12px rgba(34,21,74,.25))}
.creation-copy{padding:16px}
.creation-type{color:#e36f51;font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
.creation h3{margin:5px 0 6px;font-size:16px;letter-spacing:-.02em}
.creation p{min-height:39px;margin:0;color:var(--muted);font-size:12px;line-height:1.55}
.creation-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:12px}
.creation-tags span{padding:5px 7px;border-radius:7px;background:#edf6f2;color:#48736e;font-size:10px;font-weight:700}
.showcase-foot{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:22px;padding:17px 18px;border-radius:15px;background:#0c716b;color:#fff}
.showcase-foot p{margin:0;font-size:13px;line-height:1.45}
.showcase-foot button{flex:0 0 auto;min-height:42px;padding:0 16px;border:0;border-radius:10px;background:#ffe2ac;color:#165651;font-weight:850}
.mobile-brand{display:none}
@media(max-width:900px){
.shell{display:block;padding:0}
.story{display:none}
.auth-side{position:relative;min-height:100vh;min-height:100dvh;padding:28px 18px}
.mobile-brand{display:flex;position:absolute;top:24px;left:24px}
form{margin-top:68px;padding:30px 24px;border-radius:20px;max-width:480px}
.creation-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:430px){
.auth-side{align-items:flex-start;padding:20px 14px 28px}
.mobile-brand{top:20px;left:18px}
form{padding:26px 18px;margin-top:64px}
.form-top h2{font-size:26px}
.showcase{padding:10px}
.showcase-panel{max-height:calc(100dvh - 20px);padding:22px 15px;border-radius:20px}
.creation-grid{grid-template-columns:1fr}
.showcase-foot{align-items:flex-start;flex-direction:column}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}`;

const PAGE_OPEN = `<div class="shell"><div class="glow one"></div><div class="glow two"></div><div class="noise"></div>
<div class="showcase" id="showcase" role="dialog" aria-modal="true" aria-labelledby="showcaseTitle" onclick="closeShowcase(event)">
  <div class="showcase-panel">
    <div class="showcase-head"><div><span class="showcase-kicker">Made with 366</span><h2 id="showcaseTitle">Imagine it. Then build it.</h2><p>Start from a simple conversation and produce real, editable software. These examples show the range of projects 366 AI Designer is being built to support.</p></div><button class="showcase-close" type="button" aria-label="Close examples" onclick="closeShowcase()">×</button></div>
    <div class="creation-grid">
      <article class="creation"><div class="creation-visual cv-market"><div class="mock-window"><div class="mock-bar"></div><div class="mock-row"><i class="mock-box"></i><i class="mock-box"></i><i class="mock-box"></i></div></div></div><div class="creation-copy"><span class="creation-type">Marketplace</span><h3>Vehicle sales platform</h3><p>Search, seller profiles, listings, subscriptions and secure enquiries.</p><div class="creation-tags"><span>React</span><span>Supabase</span><span>Payments</span></div></div></article>
      <article class="creation"><div class="creation-visual cv-mobile"><div class="mock-phone"><div></div></div></div><div class="creation-copy"><span class="creation-type">Mobile app</span><h3>Food & wellness coach</h3><p>Barcode scans, daily coaching, meal planning and user progress.</p><div class="creation-tags"><span>Flutter</span><span>AI</span><span>iOS + Android</span></div></div></article>
      <article class="creation"><div class="creation-visual cv-game"><div class="mock-game">🎮</div></div><div class="creation-copy"><span class="creation-type">Game</span><h3>Strategy card adventure</h3><p>Characters, collectible cards, quests, currencies and progression.</p><div class="creation-tags"><span>Game logic</span><span>Profiles</span><span>Multiplayer-ready</span></div></div></article>
      <article class="creation"><div class="creation-visual cv-dashboard"><div class="mock-window"><div class="mock-bar"></div><div class="mock-row"><i class="mock-box"></i><i class="mock-box"></i><i class="mock-box"></i></div></div></div><div class="creation-copy"><span class="creation-type">Business software</span><h3>Operations dashboard</h3><p>Live metrics, customer records, workflows, roles and reporting.</p><div class="creation-tags"><span>Full-stack</span><span>Charts</span><span>Teams</span></div></div></article>
      <article class="creation"><div class="creation-visual cv-booking"><div class="mock-phone"><div></div></div></div><div class="creation-copy"><span class="creation-type">Service app</span><h3>Travel & booking experience</h3><p>Beautiful destinations, availability, reservations and payments.</p><div class="creation-tags"><span>Responsive</span><span>Booking</span><span>Maps</span></div></div></article>
      <article class="creation"><div class="creation-visual cv-ai"><div class="mock-window"><div class="mock-bar"></div><div class="mock-row"><i class="mock-box"></i><i class="mock-box"></i><i class="mock-box"></i></div></div></div><div class="creation-copy"><span class="creation-type">AI tool</span><h3>Specialist AI workspace</h3><p>Documents, image generation, smart search and guided automation.</p><div class="creation-tags"><span>AI agents</span><span>Files</span><span>Automation</span></div></div></article>
    </div>
    <div class="showcase-foot"><p><strong>Your idea does not need to fit a template.</strong><br>Describe the outcome and keep control of the source code.</p><button type="button" onclick="closeShowcase();if(typeof mode==='function')mode('up')">Start creating →</button></div>
  </div>
</div>
<section class="story">
  <a class="brand" href="https://366industries.com/ai-designer"><span class="mark">⚡</span><span>366 AI Designer<small>by 366 Industries</small></span></a>
  <div class="hero">
    <div class="eyebrow"><i></i> Build easy. Dream bigger.</div>
    <h1>Your calm place<br><span>to create.</span></h1>
    <p class="lede">Turn a conversation into websites, mobile apps, games and software—with room to breathe and complete ownership of your code.</p>
    <div class="capabilities">
      <span class="cap"><b>◆</b> React</span><span class="cap"><b>◆</b> Flutter</span><span class="cap"><b>◆</b> Full-stack</span><span class="cap"><b>◆</b> Games</span><span class="cap"><b>◆</b> AI-powered</span>
    </div>
    <div class="hero-actions"><button class="explore" type="button" onclick="openShowcase()">Explore creations →</button><button class="watch-demo" type="button" onclick="openShowcase()">See what’s possible</button></div>
    <div class="mini-showcase"><div class="mini-card"><b class="mini-icon">▦</b><span><strong>Business platforms</strong>Sell, book & manage</span></div><div class="mini-card"><b class="mini-icon">◉</b><span><strong>Mobile experiences</strong>Flutter-ready apps</span></div><div class="mini-card"><b class="mini-icon">✦</b><span><strong>Games & AI tools</strong>From idea to code</span></div></div>
  </div>
  <div class="proof"><span class="proof-line"></span><strong>One easy workspace. Every platform.</strong><span>Bring the idea. We’ll help build it.</span></div>
</section>
<main class="auth-side">
  <a class="brand mobile-brand" href="https://366industries.com/ai-designer"><span class="mark">⚡</span><span>366 AI Designer<small>by 366 Industries</small></span></a>`;

const PASSWORD_REVEAL = `<button class="reveal" type="button" aria-label="Show password" onclick="revealPassword(this)">◉</button>`;

const PAGE_SCRIPT = `function revealPassword(b){const p=document.getElementById("pw"),show=p.type==="password";p.type=show?"text":"password";b.textContent=show?"◎":"◉";b.setAttribute("aria-label",show?"Hide password":"Show password")}
function openShowcase(){document.getElementById("showcase").classList.add("open");document.body.style.overflow="hidden";document.querySelector(".showcase-close").focus()}
function closeShowcase(e){if(e&&e.target!==document.getElementById("showcase"))return;document.getElementById("showcase").classList.remove("open");document.body.style.overflow="";}`;

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#08090f"><title>366 AI Designer — Private access</title>
<style>${PAGE_STYLE}</style></head>
<body>${PAGE_OPEN}<form onsubmit="return go(event)"><div class="form-top"><h2>Enter the build studio</h2><p>Private access for the 366 development team.</p></div>
<label class="field"><span class="field-label">Team password</span><span class="input-wrap"><input class="password-input" type="password" id="pw" name="password" autocomplete="current-password" placeholder="Enter your access password" autofocus>${PASSWORD_REVEAL}</span></label>
<button class="submit" id="goBtn">Enter AI Designer →</button><p class="err" id="err" role="alert"></p><p class="terms">Authorized team members only. Your session is protected using a secure, HTTP-only cookie.</p><button class="examples-link" type="button" onclick="openShowcase()">See examples of what you can create</button><a class="brand-home" href="https://366industries.com/ai-designer">← Back to 366 Industries</a></form></main></div>
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
<label class="field" id="confirmField" style="display:none"><span class="field-label">Confirm password</span><span class="input-wrap"><input class="password-input" type="password" id="confirmPw" name="confirmPassword" autocomplete="new-password" placeholder="Enter the same password again"><button class="reveal" type="button" aria-label="Show confirm password" onclick="revealField(this,'confirmPw')">◉</button></span></label>
<button class="submit" id="goBtn">Open my workspace →</button><p class="err" id="err" role="alert"></p><p class="ok" id="ok" role="status"></p><p class="terms">By continuing, you agree to use 366 AI Designer responsibly and protect your account credentials.</p><button class="examples-link" type="button" onclick="openShowcase()">See examples of what you can create</button><a class="brand-home" href="https://366industries.com/ai-designer">← Back to 366 Industries</a></form></main></div>
<script>
${PAGE_SCRIPT};
function revealField(b,id){const p=document.getElementById(id),show=p.type==="password";p.type=show?"text":"password";b.textContent=show?"◎":"◉";b.setAttribute("aria-label",show?"Hide password":"Show password")}
let m="in";
function mode(x){m=x;document.getElementById("tabIn").className=x==="in"?"on":"";document.getElementById("tabUp").className=x==="up"?"on":"";
document.getElementById("nameField").style.display=x==="up"?"block":"none";
document.getElementById("confirmField").style.display=x==="up"?"block":"none";
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
if(m==="up"){body.displayName=document.getElementById("name").value.trim();body.confirmPassword=document.getElementById("confirmPw").value;if(body.password!==body.confirmPassword){err.textContent="Your passwords do not match.";btn.disabled=false;btn.textContent="Create my workspace →";return false;}}
const r=await fetch(m==="in"?"/api/auth/login":"/api/auth/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const d=await r.json().catch(()=>({}));
if(r.ok&&d.needsConfirmation){mode("in");ok.textContent="Account created! Check your inbox and select “Confirm my account.” You’ll return here to sign in.";}
else if(r.ok)location.reload();
else{err.textContent=d.error||"Something went wrong. Please try again.";btn.disabled=false;btn.textContent=m==="in"?"Open my workspace →":"Create my workspace →";}
return false;}
if(new URLSearchParams(location.search).get("confirmed")==="1"){document.getElementById("ok").textContent="Email confirmed — welcome to 366 AI Designer. Sign in to open your workspace.";history.replaceState({},document.title,"/");}
</script></body></html>`;

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
const PUBLIC_BRAND_ASSET = "/assets/366-tropical-auth-hero.png";

/**
 * Generated previews carry a separate, rotating credential in their
 * /live/<token>/ path. They cannot use the platform session cookie
 * because the iframe intentionally has an opaque sandboxed origin.
 * The live route validates its own token and returns 404 for stale or
 * incorrect credentials.
 */
const PREVIEW_PREFIX = "/live/";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (
    req.path === PUBLIC_HEALTH_PATH ||
    req.path === PUBLIC_BRAND_ASSET ||
    req.path.startsWith(PREVIEW_PREFIX)
  ) {
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
