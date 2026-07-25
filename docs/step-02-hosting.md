# Step 2 — Hosting the prototype on a real domain

**Written:** 25 July 2026
**Supplements:** `creation-platform/DEPLOY-ONLINE.md`, which covers the Render deploy itself and is still accurate. This file adds the custom-domain part, corrects one thing that doc predates, and states the security line clearly.

---

## 2.0 Read this before buying anything

A domain makes the platform reachable by anyone who types the URL. That crosses a line the codebase itself draws.

`src/services/runner.ts` executes AI-generated Python and runs `npm install` + Vite **inside your container**. The `npm install` path is the sharper edge: a generated `package.json` can name any package on the public registry, and install scripts run automatically.

So the question is not "is hosting safe" — it is **who can get past the front door.**

| Who can reach it | How | Verdict |
|---|---|---|
| Only you and the team | `ACCESS_PASSWORD` set, or accounts mode via `SUPABASE_ANON_KEY` | ✅ **Fine.** You write the prompts, you run the code. This is the Phase 1 model. |
| Anyone with the link, no gate | Neither env var set | ❌ **Do not.** Strangers execute arbitrary code in your container on your API credits. |
| Public signups | Accounts mode, open registration | 🚧 **Sandboxing ships first.** This is the hard stop from `roadmap.md` §0.1. |

**Practical consequence for a prototype demo:** if you want to show this to a client or a friend, give them a team account or the shared password — don't open registration. That keeps you in the green row.

> The platform already fails safe here: `src/middleware/auth.ts` checks accounts → password → open, in that order. Set one of the first two and the open path is unreachable.

---

## 2.0b Where this can and cannot be hosted

**Target decided: `designer.366industries.com` → Render, with Cloudflare doing DNS only.**

A plan going round suggests Cloudflare Pages as the "best fit" since the Cloudflare account already exists. It will not work, and it's worth knowing exactly why before time goes into it.

Pages Functions run on Cloudflare Workers, which is a **V8 isolate, not Node**. This platform is a long-running Node server that shells out to other programs:

| Code | What it does | Works on Workers? |
|---|---|---|
| `services/runner.ts` | `spawn("python3", ["app.py"])` for Flask previews | ❌ |
| `services/runner.ts` | `spawn("npm", ["install"])` then `npx vite` for React previews | ❌ |
| `services/studio.ts` | Shells out to FFmpeg to stitch films | ❌ |
| `lib/check.ts` | `spawnSync(py, ["-m", "py_compile", …])` | ❌ |
| `routes/generate.ts` | Long-lived SSE stream | ⚠️ Awkward |

Cloudflare added a `node:child_process` module behind a compatibility flag, **but it is a stub** — you can import it, and `spawn()` still does not work. Cloudflare's own position is that spawning processes doesn't fit the isolate model. There is also no Python interpreter and no FFmpeg in that runtime. ([Cloudflare — Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/))

Vercel is a poor fit for the same underlying reason — serverless functions, no persistent process, no Python or FFmpeg. And this is not a Next.js app, which is where Vercel's advantage would come from.

**So of the three options suggested, only the third works.** The repo already contains a `Dockerfile` with Node + Python + Flask + FFmpeg, built for exactly this.

| Component | Where | Why |
|---|---|---|
| The app | **Render** (or Railway) | Runs the Dockerfile as a real container with a real process |
| DNS for `designer.366industries.com` | **Cloudflare** | Where the zone already lives |
| TLS | **Render** | Issued and renewed automatically |

A `render.yaml` blueprint is now in the repo root. Render → **New → Blueprint** → point at the repo, and it reads the plan, disk, health check, and the list of env vars to prompt for.

Also: **do not create a `wrangler.toml`.** That is Cloudflare Workers configuration and has no meaning for this deployment.

### The `/ai-designer` page

Keeping the marketing page on the main site and the builder on a subdomain is the right split:

- `366industries.com/ai-designer` — product page, stays where it is
- `designer.366industries.com` — the builder itself
- The buttons on `/ai-designer` link to `https://designer.366industries.com`

Visitors clicking through will land on the login gate, not the builder. That is intended — see §2.0.

---

## 2.0c The health check has to be `/healthz`

Worth understanding, because getting it wrong produces a confusing failure.

With `ACCESS_PASSWORD` set — which is how you deploy — `src/middleware/auth.ts` correctly returns **401 for every path**, including `/`. Render marks any non-2xx health check as unhealthy and restarts the service, so a health check pointed at `/` puts the deploy into a restart loop while the app itself is working perfectly.

Measured on a production-shaped run:

| Path | With `ACCESS_PASSWORD` set |
|---|---|
| `/healthz` | **200** `{"ok":true}` |
| `/` | 401 (login page) |
| `/api/health` | 401 |
| `/api/projects` | 401 |
| `/media/` | 401 |

`/healthz` is allowlisted in the auth middleware and returns nothing but `{"ok":true}`. `/api/health` deliberately stays gated because it reports which providers have keys configured. `render.yaml` already points at `/healthz`.

---

## 2.1 Deploy to Render

1. Push the current code to GitHub. Render deploys what's in the repo.
2. Render → **New → Blueprint** → select `366-AI-Software-Homebrew`. It picks up `render.yaml` at the repo root, which already sets `rootDir: creation-platform`, the Docker runtime, the 1 GB `/app/media` disk, and the health check.
3. Render prompts for every `sync: false` env var. Fill in at minimum `ACCESS_PASSWORD`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
4. First build takes a few minutes — the image installs Python, Flask and FFmpeg.
5. Confirm it works on the `*.onrender.com` URL **before** touching DNS. Debugging a broken app and a broken DNS record at the same time is miserable.

---

## 2.2 Pointing `designer.366industries.com` at it

1. Render → your service → **Settings → Custom Domains → Add Custom Domain** → `designer.366industries.com`. Render shows the record it expects.
2. Cloudflare dashboard → `366industries.com` → **DNS → Records → Add record**:

| Type | Name | Target | Proxy status |
|---|---|---|---|
| `CNAME` | `designer` | `<your-service>.onrender.com` | **DNS only** (grey cloud) |

3. Wait for propagation — usually minutes.
4. Render shows **Certificate issued** when TLS is live. Load `https://designer.366industries.com` and confirm the padlock.

### Why grey cloud, not orange

Two reasons, and the second is the one that will waste your afternoon if you miss it:

1. **Redirect loops.** Cloudflare's proxy terminates TLS itself. In front of Render's own certificate, the two disagree until Cloudflare's SSL mode is set to *Full (strict)*. Grey cloud sidesteps it.
2. **SSE buffering.** This app streams generated code to the browser token by token over Server-Sent Events. A proxy that buffers responses turns that live stream into one silent pause followed by a wall of text. The feature still technically works; it stops feeling like the thing you built.

You can revisit orange cloud later for DDoS protection and caching — but do it deliberately, with SSL mode on *Full (strict)*, and re-test that code still streams live.

---

## 2.3 Environment variables on Render

Set these in Render → Environment. Never in the repo.

| Variable | Required? | Note |
|---|---|---|
| `ACCESS_PASSWORD` | ✅ **Yes** | The lock. Long and random — a passphrase, not a word. |
| `ANTHROPIC_API_KEY` | ✅ | Primary code model |
| `OPENAI_API_KEY` | Optional | Alt model + `gpt-image` |
| `GOOGLE_API_KEY` | Optional | Gemini, Veo video, TTS narration |
| `SUPABASE_URL` | ✅ | Otherwise projects vanish on redeploy — see §2.4 |
| `SUPABASE_SERVICE_KEY` | ✅ | Server-only. Bypasses RLS. |
| `SUPABASE_ANON_KEY` | Recommended | Switches on per-user accounts instead of one shared password |
| `NETLIFY_TOKEN` | Optional | The 🚀 Publish button |

Leave the `*_MAX_TOKENS` vars unset unless you change models — the defaults are now each model's documented maximum.

### Which Supabase key goes where

The dashboard shows two tabs and the naming does not line up with our variable names. Use the **first** tab, "Publishable and secret API keys":

| Dashboard | Env var | Notes |
|---|---|---|
| **Publishable key** — `sb_publishable_…` | `SUPABASE_ANON_KEY` | Safe in a browser. RLS applies. Setting it switches on accounts mode. |
| **Secret key** — `sb_secret_…` (click the eye to reveal) | `SUPABASE_SERVICE_KEY` | Bypasses RLS. Server-side only. |

Ignore the "Legacy anon, service_role API keys" tab entirely.

**The variable names are misleading and that is our fault, not yours** — they date from when Supabase only issued JWT keys. `src/services/auth.ts` and `src/services/supabase.ts` only ever put these in `apikey` and `Authorization: Bearer` headers and never decode them, so the new key format is a drop-in replacement. Verified against project `ujkizgblscqcejghxemb` on 25 July 2026:

| Endpoint | `sb_publishable_…` | Legacy `eyJhbGci…` |
|---|---|---|
| `GET /auth/v1/settings` | `200` | `200` |
| `GET /auth/v1/user` (no session) | `401` | `403` |
| `GET /rest/v1/projects` | `200`, `[]` | `200`, `[]` |

Both work. The new key is marginally better behaved — `401 Unauthorized` is the correct status for "no session", where the legacy key returns `403 Forbidden`.

> ⚠️ **Do not click "Disable JWT-based API keys" yet.** Switch the env vars over, restart, and confirm you can sign in first. Disabling the legacy keys while anything is still using them locks the running app out of its own database.

---

## 2.4 One correction to DEPLOY-ONLINE.md

That doc says saved projects are wiped on redeploy and that moving them to a real database is "on the roadmap (Phase 3)."

**That already shipped.** Phase 3.2 added `src/services/supabase.ts`, and with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` set, projects live in Postgres and survive redeploys. No Render disk needed for them.

Still ephemeral, and still needing a Render disk if you care about them:

- `media/` — generated video clips and assembled films
- generated game art PNGs, until they are attached to a saved project

For a prototype, losing those on redeploy is usually acceptable. Add a 1 GB disk mounted at `/app/media` if it isn't.

---

## 2.5 Layout fixes shipped for this

The UI was audited before hosting. Three things would have shown up badly on a real domain, and are now fixed in `public/index.html`:

| Issue | Was | Now |
|---|---|---|
| Mobile viewport | `height: 100vh` — mobile browsers count the address bar in `100vh`, pushing the prompt box off-screen | `100dvh` with a `100vh` fallback |
| Header on phones | 11 controls with `flex-wrap: wrap` stacked into ~4 rows, consuming most of a 360px screen before the app started | One horizontally scrolling row; wordmark hidden below 800px |
| Contrast | White text on `#6c7bff` measured **3.55:1** — below the WCAG AA 4.5:1 threshold, on the Build button and every user chat bubble | Accents darkened to `#4f61ff` (4.68:1) and `#8556f6` (4.51:1); a separate brighter `--ring` for focus outlines |

Also added: `<meta name="description">`, `theme-color`, an inline SVG favicon, `focus-visible` outlines on all controls, and `overflow-wrap: anywhere` on the code view (it was `word-break: break-all`, which split every identifier mid-word).

Measured contrast after the change:

| Pair | Ratio | AA (4.5:1) |
|---|---|---|
| White on `--accent` | 4.68 | ✅ |
| White on `--accent2` | 4.51 | ✅ |
| Body text on background | 15.69 | ✅ |
| Muted text on background | 6.01 | ✅ |
| Code text on code panel | 13.27 | ✅ |

---

## 2.6 Checklist before you announce the URL

- [ ] `ACCESS_PASSWORD` set on Render, and it is long and random
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` set, so projects persist
- [ ] Loading the domain over `https://` shows the login gate, not the builder
- [ ] Opening it in a private window also shows the gate — confirms no cached session
- [ ] A generated app previews correctly, on a phone as well as a laptop
- [ ] Anthropic spend limit set — a public URL plus a shared password is a bigger blast radius than localhost
- [ ] You have not enabled open signups

---

## 2.7 Cost

| Item | Cost |
|---|---|
| Domain | $10–15/year |
| Render Starter (no idle sleep) | ~$7/month |
| Render Free | $0, sleeps after ~15 min idle, ~1 min cold start |
| Supabase Free | $0 at this scale |
| TLS certificate | $0 — Render issues and renews it |
| **AI usage** | **The real cost.** Everything else is rounding. |

For a prototype you are demoing, Render Free is genuinely fine — the cold start is a minute of awkwardness, not a failure. Move to Starter when someone other than you depends on it responding immediately.

---

## Sources

- `creation-platform/DEPLOY-ONLINE.md`, `creation-platform/Dockerfile`, `src/middleware/auth.ts`, `src/services/{runner,supabase}.ts` — read directly
- Contrast ratios computed against the WCAG 2.1 relative-luminance formula
