# Creation Platform — Phased Requirements Record

**Owner:** Jordi · **Started:** July 2026 · **Status legend:** ✅ done · 🔨 in progress · ⬜ planned

Vision: an in-house AI creation platform — apps/websites (Lovable/Bolt/Replit-class), mobile games 2D/3D, and AI video — built for ourselves first, then offered to the world.

---

## Phase 0 — Foundation ✅ (July 2026)

**Goal:** prove the core loop and own a multi-LLM gateway.

| Requirement | Status |
|---|---|
| Multi-LLM gateway: Claude, OpenAI, Gemini behind one interface | ✅ |
| Prompt → complete working app, rendered in sandboxed live preview | ✅ |
| Conversational editing (change requests re-generate full app) | ✅ |
| Save / load / download projects | ✅ |
| Runs fully in-house on one machine, keys in `.env` | ✅ |

Delivered as `ai-app-builder/` (v0.1, plain JavaScript — kept as reference).

## Phase 1 — Professional Core 🔨 (this build: v0.2)

**Goal:** rebuild on the correct professional stack so everything after has solid bones.

| Requirement | Status |
|---|---|
| TypeScript throughout (the language Lovable, Bolt, Replit, Dyad use) | 🔨 |
| Modular architecture: config / providers / routes / services separated | 🔨 |
| **Streaming generation (SSE)** — code appears live as the AI writes it | 🔨 |
| Automated tests + type-checking (quality gate before every change) | 🔨 |
| Storage behind a service interface (JSON now → Postgres later, no rewrite) | 🔨 |
| Provider adapters isolated so new AIs are one small file each | 🔨 |

**Exit criteria:** type-check passes, tests pass, server boots, all three providers stream.

### Phase 1.1 — Multi-language targets ✅ (v0.3, July 2026)

User choice of generated language/framework, per team decision ("don't limit users"):

| Target | Output | Preview |
|---|---|---|
| 🌐 Web App | single HTML file | instant, in-browser |
| 📱 Flutter (Dart) | full project: pubspec.yaml + lib/ | download ZIP → `flutter run` |
| 🐍 Python (Flask) | app.py + requirements.txt (+ templates) | download ZIP → `python app.py` |

Implementation: target registry (`src/targets.ts`) with per-language expert system prompts; multi-file output parser with path-traversal protection (`src/lib/files.ts`); file-tab code viewer + client-side ZIP download. Adding React Native, Godot GDScript, etc. = one new registry entry.

Note for the record: the *platform* stays TypeScript (like Lovable/Bolt/Replit — invisible to users); what users choose is the *generated* language.

### Phase 1.2 — Game target + auto-fix loop ✅ (v0.4, July 2026)

- 🎮 **Godot 4 (GDScript) target**: generates complete playable 2D game projects (project.godot + scenes + scripts, built-in nodes only, touch + keyboard input). First deliverable of the Phase 4 game track.
- **Auto-fix loop v1** (`src/lib/check.ts`): generated Python is syntax-checked with the local interpreter; on failure the errors are sent back to the model, which streams a corrected project — automatically. Skips gracefully if Python isn't installed. Structure ready for `dart analyze` (Flutter) and Godot headless checks next.

### Phase 1.3 — Web-based delivery ✅ (v0.5, July 2026)

**Requirement (recorded):** generated projects must be usable in the browser, not only as PC downloads.

- 🐍 Python: **"Run in browser" live preview** — the platform runs the generated Flask app locally (`src/services/runner.ts`) and shows it in the preview pane. No ZIP, no terminal.
- 📱 Flutter: every generated app is kept **web-compatible** (no dart:io); runs in the browser with `flutter run -d chrome` and deploys as a website with `flutter build web`.
- 🎮 Godot: exports to web (HTML5) from the Godot editor — automated web export is a Phase 4 item.
- ⚠️ Security note (recorded): live preview executes generated code on the local machine. Fine for in-house use with our own generations; MUST move into real sandboxing (Docker/Firecracker) before outside users get access (Phase 3 hard requirement).

### Phase 1.4 — Video studio kickoff ✅ (v0.6, July 2026)

🎬 **AI Video target**: generates a complete 1-minute-movie production kit — 8-scene screenplay, character bible with verbatim-repeatable descriptions (the core consistency technique), scenes.json with self-contained keyframe/video prompts per scene, and a production guide with FFmpeg assembly commands. This is the script-engine layer of Phase 5; automating the image/video API calls is the next Phase 5 milestone.

Also: PUSH-TO-GITHUB.md added — repo is https://github.com/Hunting-Fishing/366-AI-Software-Homebrew (pushed manually via GitHub Desktop until a GitHub MCP connection is available in-session).

### Phase 5.1 — Image generation gateway + keyframes ✅ (v0.7, July 2026)

- **Image gateway** (`src/providers/images.ts`): OpenAI gpt-image and Google Imagen behind one `generateImage()` interface, mirroring the text gateway. Will also serve game sprites/textures (Phase 4).
- **🖼 Generate keyframes**: on any video project, one click walks `scenes.json` and generates every scene keyframe, shown as a gallery in the preview pane (right-click to save each image). Failures per-scene are reported without stopping the batch.
- Remaining Phase 5 automation: image-to-video API calls (Veo/Runway/Kling) and server-side FFmpeg assembly.

### Phase 2.1 — One-click publish ✅ (v0.8, July 2026)

🚀 **Publish button**: any generated web app deploys to a public URL via Netlify's API (free tier, `NETLIFY_TOKEN` in .env). Zero new dependencies — uses Netlify's file-digest flow with Node's built-in crypto (`src/services/deploy.ts`). UI confirms before anything goes public. Remaining Phase 2: multi-file React generation, generated-app databases, Capacitor packaging, version history.

### Phase 5.2 — Full movie pipeline ✅ (v0.9, July 2026)

The end-to-end flow now exists in one product: movie plan → 🖼 keyframes → 🎞 **Animate & assemble** — each keyframe animated via **Google Veo** (`src/providers/videos.ts`, long-running job with polling), clips stored in `media/`, stitched by **FFmpeg** server-side (`src/services/studio.ts`), final film plays in the preview. Requires: GOOGLE_API_KEY with paid AI Studio tier for Veo (~$1–3/scene) and FFmpeg installed (`winget install ffmpeg`). Remaining Phase 5: voiceover/music tracks, Runway/Kling adapters, per-scene retakes.

## Phase 2 — Product-grade App Builder ⬜ (next 1–3 months)

**Goal:** daily-driver quality for our own team.

- Multi-file project generation (real React/Next.js codebases, not just single-file HTML), with a file-tree UI
- One-click deploy of generated apps (Vercel/Netlify/Cloudflare APIs) + custom domains
- Generated-app databases (Supabase/Postgres provisioning per project)
- Capacitor packaging pipeline → installable Android/iOS builds
- Version history per project (every edit = a commit; connect GitHub)
- Prompt-quality work: per-framework system prompts, automatic error-fix loop (build the app headlessly, feed errors back to the model — this is Bolt's core trick)

### Phase 3.1 — Online deployment ✅ (v1.0, July 2026)

The platform now runs **online, not just on one PC**: `Dockerfile` (Node + Python + FFmpeg in one image), **password gate** (`ACCESS_PASSWORD` env → login page + 401s; open mode locally), and `DEPLOY-ONLINE.md` (Render.com from the GitHub repo, auto-deploy on push, HTTPS included). One shared team password = right size for "ourselves online"; per-user accounts remain the Phase 3 milestone below.

## Phase 3 — Multi-user & "for the world" ⬜ (months 3–6)

**Goal:** other people can use it safely.

- Next.js frontend + Postgres + auth (email/OAuth), teams and roles
- Server-side sandboxing for generated code (Docker/Firecracker or WebContainers licence)
- Usage metering, rate limits, billing (Stripe), abuse protection
- Hosting: start on one VPS (Hetzner/Fly.io), design stateless so it scales

## Phase 4 — Game Creation Pipeline ⬜ (parallel track from month 2)

- Godot 4 project templates (2D runner, match-3, deckbuilder, 3D starter)
- "AI game assistant" on our gateway: mechanic description → GDScript + scene files
- AI asset pipeline: sprites/textures via image APIs with locked style prompts
- Data-driven design: cards/levels/enemies as JSON the AI can write and balance
- Backend for accounts/leaderboards: Nakama (open source, self-hosted)
- Ship order: tiny 2D game → deckbuilder (Slay-the-Spire-like) → 3D prototype → live-service ambitions last

## Phase 5 — AI Video Studio ⬜ (from month 3)

- Script engine: LLM writes N-scene screenplay as structured JSON
- Character consistency: character sheets + image-first keyframes fed to image-to-video models (Veo on Vertex, Runway, Kling)
- Voice (ElevenLabs/Google TTS) + music + FFmpeg assembly (fully in-house)
- Target: repeatable 1-minute movie with a consistent lead character

---

## Working rules (apply to every phase)

1. **Record before build:** every phase gets its requirements written here first.
2. **Quality gate:** `npm run check` (types) and `npm test` must pass before a phase is marked done.
3. **Never break the trunk:** v0.1 stays runnable while v0.2 is built, and so on.
4. **Own the core, rent the edges:** gateway, prompts, and pipelines are ours; commodity infra (hosting, auth, video models) is rented until scale justifies otherwise.
5. **Version control:** move this repo to GitHub as soon as possible (private repo).
