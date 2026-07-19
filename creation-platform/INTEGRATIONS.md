# Master List — Every API, Integration & External Software

**Status legend:** ✅ integrated & working · 🔑 integrated, needs your key/install · ⬜ planned

## 1. AI APIs (the brains — keys go in `.env`)

| Service | Used for | Env variable | Cost | Status |
|---|---|---|---|---|
| Anthropic Claude | App/game/movie-plan generation (text) | `ANTHROPIC_API_KEY` | ~$0.01–0.10 per generation | 🔑 |
| OpenAI ChatGPT | Same, alternative brain | `OPENAI_API_KEY` | similar | 🔑 |
| OpenAI Images (gpt-image) | Keyframes, future game sprites | same key | ~$0.02–0.10 per image | 🔑 |
| Google Gemini | Same, third brain | `GOOGLE_API_KEY` | similar; has free tier | 🔑 |
| Google Imagen | Images, alternative | same key (paid tier) | ~$0.03–0.06 per image | 🔑 |
| Google Veo | AI motion video (subjects move/act) | same key (paid tier) | ~$1–3 per 8-sec scene | 🔑 |
| Google Gemini TTS | 🎤 Movie narration voice | same key | pennies per minute | 🔑 (v1.3) |
| Google **Vertex AI** | Enterprise billing/quotas for all Google models | swap URL+OAuth in adapters | same models | ⬜ when scaling |
| Runway / Kling / Luma | Alternative AI video engines | one adapter file each | per-second pricing | ⬜ |
| ElevenLabs | Premium voices for narration/characters | `ELEVENLABS_API_KEY` | ~$5/mo starter | ⬜ |
| Suno (or licensed tracks) | Music for movies | — | varies | ⬜ |

**Set spending limits in every provider console.** Anthropic: console.anthropic.com · OpenAI: platform.openai.com · Google: aistudio.google.com

## 2. In-house engines (ours, free, no API)

| Piece | Does | Status |
|---|---|---|
| Multi-LLM gateway (`src/providers/`) | One interface to all AI brands | ✅ |
| In-house motion engine (`src/services/motion.ts`) | Movies from stills — pans/zooms/stitching | ✅ |
| FFmpeg assembly + audio mix (`src/services/studio.ts`) | Stitching, narration mixing | ✅ (needs FFmpeg installed) |
| Auto-fix loop (`src/lib/check.ts`) | Self-correcting code generation | ✅ |
| Password gate (`src/middleware/auth.ts`) | Online protection | ✅ |
| **Local AI video model** (LTX-Video / HunyuanVideo via ComfyUI) | Fully-owned Veo replacement | ⬜ needs NVIDIA GPU 16–24GB (~$1–2k once) |
| **Local image model** (Stable Diffusion/Flux) | Free unlimited images/sprites | ⬜ same GPU |

## 3. Software to install on your PC (all free)

| Software | For | Get it | Status |
|---|---|---|---|
| Node.js LTS | Runs the platform | nodejs.org | 🔑 required |
| Git for Windows | `push-github.bat` version control | git-scm.com | 🔑 required |
| FFmpeg | Movies (assembly, in-house engine, narration) | `winget install ffmpeg` | 🔑 required for video |
| Python 3 + Flask | "Run in browser" for generated Python apps | python.org, then `pip install flask` | 🔑 for Python preview |
| Flutter SDK | Run/build generated mobile apps | docs.flutter.dev | 🔑 for Flutter work |
| Godot 4 | Open/play generated games | godotengine.org | 🔑 for games |
| GitHub Desktop (optional) | Point-and-click alternative to the .bat | desktop.github.com | optional |

## 4. Accounts & hosting services

| Service | For | Cost | Status |
|---|---|---|---|
| GitHub (Hunting-Fishing/366-AI-Software-Homebrew) | Code backup & deploy source | free | ✅ |
| Netlify | 🚀 Publish button (hosts generated apps) | free tier | 🔑 `NETLIFY_TOKEN` |
| Render.com | Hosts the platform online (Dockerfile ready) | $0–7/mo | 🔑 per DEPLOY-ONLINE.md |
| Google Play Console | Ship Android apps/games | $25 once | ⬜ |
| Apple Developer | Ship iOS apps/games | $99/yr | ⬜ |
| Supabase (Postgres) | Real database at Phase 3 (multi-user) | free tier | ⬜ |
| Stripe | Billing when we sell to the world | % of sales | ⬜ |
| Capacitor (library) | Wrap web apps into store-ready mobile apps | free | ⬜ Phase 2 |
| Nakama (self-hosted) | Game accounts/leaderboards/multiplayer | free, our server | ⬜ Phase 4 |

## 5. Gaps this file just closed (things previously missed)

- Narration voice (added v1.3 via Gemini TTS), music (still ⬜ — Suno or licensed)
- App-store developer accounts for actually shipping mobile games
- The GPU purchase decision for fully in-house AI video/images
- Stripe + Supabase + real sandboxing as hard prerequisites before "for the world"

Keep this file updated every time we add or plan an integration — it's the shopping list for the whole vision.
