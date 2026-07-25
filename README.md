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

## Run it locally

Requires **Node 18+**. Python 3 and FFmpeg are optional — without them the live Python preview and the video studio are skipped, everything else works.

```bash
cd creation-platform
npm install
cp ../.env.example .env        # then fill in at least one model key
npm run dev
```

Open http://localhost:3000.

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
| Targets | `src/targets.ts` — web · react · flutter · python · godot · book · video |
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
