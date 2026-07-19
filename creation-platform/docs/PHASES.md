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

### Phase 5.3 — Movie styles + Photo Movie ✅ (v1.1, July 2026)

- **Style presets** for all video work: 🎬 Cinematic, 📱 Phone/vlog (vertical 9:16, handheld realism), 🍳 Cooking show, 🚀 Space flight, 🧱 Toy/Lego stop-motion. Styles inject into movie plans and every Veo prompt; aspect ratio follows the style.
- **📸 Photo Movie**: upload your own photos (toys on a diorama, anything) → the AI writes a continuity-aware shot list (`/api/video/shotlist`) → Veo animates each actual photo → FFmpeg stitches the film. Your real toys become the actors.
- Next in Phase 5: voiceover + music tracks, per-scene retakes, Runway/Kling adapters.

### Phase 5.4 — IN-HOUSE video engine ✅ (v1.2, July 2026)

**Our own video generation, no external integrations** (`src/services/motion.ts`): FFmpeg-powered motion engine renders movies from keyframes or user photos with rotating cinematic camera moves (zoom in/out, pan left/right — the documentary "Ken Burns" technique), both aspect ratios, stitched in-house. Free, works offline, always available. Veo remains the optional paid "subjects move & act" engine; the UI offers both. Also added `push-github.bat` — double-click to commit+push (GitHub sign-in via Git's own browser popup; no tokens handled by anyone else).

**Path to fully in-house AI motion (recorded for later):** run an open-source video model (LTX-Video / HunyuanVideo / Stable Video Diffusion via ComfyUI) on our own GPU (needs a 16–24GB NVIDIA card, ~$1–2k one-time) and add it as a third engine behind the same interface. That is the true "Veo replacement we own."

### Phase 5.5 — Narration ✅ (v1.3, July 2026)

🎤 **Add narration** on any finished movie: Gemini TTS (same GOOGLE_API_KEY, pennies/minute) speaks your text — pre-filled from the screenplay's voiceover lines — and FFmpeg mixes it into the film in-house (`mixVoiceover` in studio.ts, `src/providers/speech.ts`). ElevenLabs slots in later as a premium voice adapter. Also added **INTEGRATIONS.md** — the master list of every API, account, and software the whole vision needs. Remaining Phase 5: per-scene retakes, local GPU video model.

### Phase 5.6 — Music ✅ (v1.4, July 2026)

🎵 **Add music** on any finished movie: pick any audio file you own (royalty-free track etc.) and the in-house pipeline mixes it under the film — looped to fit, and automatically ducked to 25% volume beneath narration when the movie already has a voice track (`mixMusic` in studio.ts). The film pipeline is now complete: plan → keyframes → motion (in-house or Veo) → narration → music.

### Phase 2.2 — Multi-file React ✅ (v1.6, July 2026)

⚛️ **React App target**: generates professional multi-file Vite + React projects (components split under src/, proper config), streamed live with file tabs like everything else. **Run in browser** now works for React too — the platform npm-installs the project and runs its Vite dev server locally, Lovable-style (first run ~1 min, then fast via npm cache). ZIP download gives a standard project any React developer can work on; `npm run build` produces deployable files for the 🚀 Publish flow (auto-publish of built React apps = next Phase 2 item).

### Phase 2.3 — React publish + art persistence ✅ (v1.7, July 2026)

- 🚀 **Publish now works for React projects**: the platform runs `npm run build` itself (`src/services/build.ts`) and deploys the optimized dist/ to Netlify — full Lovable loop for professional apps: generate → preview → iterate → live URL.
- 💾 Game art (and any binary assets) now **persists with saved projects** — the v1.5 caveat is closed.

### Phase 4.1 — AI game art ✅ (v1.5, July 2026)

🎨 Godot games now ship with AI-drawn graphics: every generated game includes `assets.json` (sprite list with style-consistent prompts) and loads textures with a safe fallback, so it runs perfectly with primitives alone AND upgrades itself when the art exists. The **Generate game art** button draws every sprite through the image gateway, previews them in a gallery, and packs the PNGs into the ZIP — unzip, open in Godot, the game is skinned. (Art not yet persisted with saved projects; regenerate after loading.)

## Phase 6 — Book Studio 🔨 (started v1.8, July 2026)

**Goal:** full book series from user prompts/assets — a major product line.

### Phase 6.1 — Core book pipeline ✅ (v1.8)

- 📚 **Book target** with four types: 📖 picture books, 🖍 coloring books (line-art enforced), 🌟 choose-your-own-story (branching pages, multiple endings, clickable choices), 🎓 leveled readers (pre-K → university, level obeyed in every page's text). Every book designed as part of a series (bible in style.md, next-volume hook).
- **🖼 Illustrate book**: every page drawn via the image gateway using verbatim character descriptions for consistency.
- **📖 View book**: compiled to a beautiful printable book.html (browser Print → Save as PDF = the real book; print CSS included). Saved into the project and the ZIP.
- **🎥 Animate book**: pages become a video storybook via the in-house motion engine; 🎤 narration pre-fills with the full book text (read-aloud videos), then 🎵 music.

### Phase 6 next: user-supplied assets (their photos/drawings as characters), EPUB export, per-page re-illustration, series manager (shared bible across volumes).

### Phase 3.2 — Real database ✅ (v1.9, July 2026)

🗄 **Supabase Postgres storage** (project ujkizgblscqcejghxemb): the ProjectStore interface went async and gained a second implementation (`src/services/supabase.ts`, PostgREST via fetch — no SDK). With SUPABASE_URL + SUPABASE_SERVICE_KEY in .env the platform stores projects in the cloud database (survives redeploys, shared between PC and Render); without them it falls back to local JSON. Setup: SETUP-SUPABASE.md. Next: Phase 3.3 user accounts (Supabase Auth), then metering, job queue, sandboxing.

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
