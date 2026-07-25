# 366 AI Creation Platform

In-house AI creation platform — apps and websites (Lovable/Bolt/Replit-class), 2D games, books, and AI video. Built for ourselves first.

- **Product page:** https://366industries.com/ai-designer
- **Builder:** https://designer.366industries.com *(once deployed)*

---

## Repository layout

```
creation-platform/     v2.0 — THE ACTIVE PLATFORM (TypeScript + Express)
ai-app-builder/        v0.1 — original JS prototype, kept as reference only
docs/                  Roadmap and step-by-step build guides
render.yaml            Render deployment blueprint
.env.example           Every environment variable, with what reads it
BLUEPRINT.md           Original architecture doc, July 2026
```

Start with [`docs/roadmap.md`](docs/roadmap.md).

---

## Run it

**Double-click `START-HERE.bat`.**

It checks Node is installed, creates the settings file if missing, installs dependencies on first run, starts the server and opens your browser. If something is missing it opens the right file and tells you exactly what to paste where.

You need **two values** in `creation-platform/.env`, both marked `← FILL THIS IN`:

| | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API Keys → **first tab** → Secret keys → eye icon |

Everything else is pre-filled. `.env` is gitignored — your keys never reach GitHub.

<details>
<summary>Command line instead</summary>

```bash
cd creation-platform
npm install
npm run doctor      # what is configured, what is not
npm run dev
```
</details>

Every start prints a check like this, so you always know what is on:

```
  ┌─ Startup check ────────────────────────────────────
  │ ✓ AI model        Claude
  │ ✓ Storage         Supabase — projects survive restarts
  │ ✓ Sign-in         Per-user accounts
  │ ✓ Python preview  Available — generated Flask apps run in the browser
  │ ✓ Video studio    FFmpeg found — movie assembly, narration and music work
  │ ! Publish button  Off. Add NETLIFY_TOKEN to publish generated apps to the web.
  │ ! Agent lane B    Off. Edits use the in-house loop.
  └────────────────────────────────────────────────────
```

A `!` is a feature you have not switched on, not a problem. Only a `✗` stops the app.

Requires **Node 18+**. Python 3 and FFmpeg are optional. Deliberately *not* required anywhere: Flutter SDK, Android SDK, Xcode — the mobile target builds as a web app and Capacitor wraps it natively on your own machine.

Quality gate — both must pass before any change is called done:

```bash
npm run check                  # tsc --noEmit
npm test                       # 52 tests
```

---

## Architecture in one paragraph

An Express server wraps a **multi-LLM gateway** (Claude, GPT, Gemini behind one interface). A prompt plus a per-language expert system prompt from `src/targets.ts` produces a project, streamed to the browser over SSE as it is written. Generation runs through the **agent lane** seam in `src/lanes/` — Lane A is the in-house loop; Lane B (OpenHands, in progress) will handle surgical edits to existing codebases. Projects persist to **Supabase Postgres** with row-level security. Generated apps preview live and publish to Netlify.

| Layer | Implementation |
|---|---|
| Model gateway | `src/providers/` — anthropic · openai · google · images · speech · videos |
| Agent lanes | `src/lanes/` — the create/edit routing seam |
| Targets | `src/targets.ts` — web · react · **mobile** · flutter · python · godot · book · video |
| Storage | `src/services/supabase.ts` — PostgREST, no SDK |
| Auth | `src/middleware/auth.ts` — accounts → team password → open |
| Execution | `src/services/runner.ts` — **runs on the host today**, see below |

---

## Before opening this to anyone outside the team

`src/services/runner.ts` executes AI-generated code in the server's own process — `spawn("python3", …)`, `npm install`, `npx vite`. That is fine while you write the prompts and you run the code. It is not fine for strangers.

**Always set `ACCESS_PASSWORD` (or `SUPABASE_ANON_KEY` for per-user accounts) before deploying.** Do not enable open signups until sandboxing ships — see [`docs/roadmap.md`](docs/roadmap.md) §0.1.

---

## Deployment

Render, via the `Dockerfile` and `render.yaml`. Cloudflare handles DNS only.

**Cloudflare Pages and Vercel cannot host this app** — Workers is a V8 isolate where `node:child_process` is a non-functional stub, and neither platform provides Python or FFmpeg. Full reasoning in [`docs/step-02-hosting.md`](docs/step-02-hosting.md) §2.0b.

---

## Secrets

Never committed. `.env` is gitignored; `.env.example` documents every variable and what reads it. In production they live in Render's environment settings.

`SUPABASE_SERVICE_KEY` bypasses row-level security — treat it as a root password to the database.
