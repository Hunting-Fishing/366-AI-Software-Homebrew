# In-House AI Creation Platform — Architecture Blueprint

**Prepared for:** Jordi
**Date:** July 18, 2026
**Goal:** Build, as much as possible in-house, (1) an AI app builder like Lovable/Bolt/Replit, (2) a mobile game creation pipeline (2D/3D), and (3) an AI video studio for 1-minute movies with consistent characters — all powered by multiple AI providers (Anthropic Claude, OpenAI, Google Vertex/Gemini).

---

## 1. The Big Picture

All three products share one foundation: a **multi-LLM gateway** — a single piece of code that can talk to Claude, ChatGPT, and Gemini interchangeably. Build it once, and every product plugs into it.

```
                    ┌─────────────────────────────┐
                    │      MULTI-LLM GATEWAY      │
                    │  Claude / OpenAI / Gemini   │
                    └──────────┬──────────────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
   │ AI APP BUILDER│   │ GAME PIPELINE │   │ AI VIDEO      │
   │ (Phase 1)     │   │ (Phase 2)     │   │ STUDIO        │
   │ websites +    │   │ Godot engine  │   │ (Phase 3)     │
   │ mobile apps   │   │ 2D/3D mobile  │   │ 1-min movies  │
   └───────────────┘   └───────────────┘   └───────────────┘
```

**Honest scoping note:** Lovable raised tens of millions of dollars and has a large engineering team. So did Supercell (Clash of Clans). You will not replicate them in a week. But you *can* build a genuinely useful in-house version of each, in phases, and the starter code delivered with this document is a real, working Phase 1.

---

## 2. Phase 1 — AI App Builder (starter code included)

### What it does
You type "make me a workout tracker app," pick which AI to use (Claude, GPT, or Gemini), and it generates a complete, working app that appears instantly in a live preview. You can then say "make the buttons bigger" and it updates. Apps can be saved and downloaded.

### How Lovable/Bolt actually work (and how ours works)
The secret is smaller than people think:

1. A **system prompt** tells the AI: "You are an expert app developer. Output a complete, single-file HTML app with all CSS and JavaScript inline."
2. The AI's output is rendered in a **sandboxed iframe** — that's the "live preview."
3. **Iteration** works by re-sending the current code plus the user's change request.
4. Real products add: cloud hosting of generated apps, user accounts, databases for generated apps, and multi-file React projects. These are Phase 1.5+ upgrades.

### Stack (chosen for a beginner team)
| Piece | Choice | Why |
|---|---|---|
| Server | Node.js + Express | Simplest mainstream stack; one language everywhere |
| AI calls | Direct HTTPS (no SDKs) | Fewer dependencies, easier to read and debug |
| Frontend | Plain HTML/JS, no build step | Nothing to compile; open the page and it works |
| Storage | JSON files on disk | No database to set up; upgrade to SQLite/Postgres later |
| Generated apps | Single-file HTML | Runs anywhere, previews instantly, downloadable |

### Mobile apps
Generated apps are mobile-responsive web apps. To turn one into a real installable Android/iOS app, wrap it with **Capacitor** (free, one command: `npx cap add android`). That is the same trick many "app builders" use. Native-feel apps via React Native/Flutter generation is a Phase 1.5 upgrade.

### Roadmap for Phase 1
- **v0 (delivered today):** prompt → app, live preview, edit loop, 3 providers, save/download.
- **v1.5:** multi-file React project generation, one-click deploy (Netlify/Vercel API), Capacitor packaging for app stores, user accounts.
- **v2:** databases for generated apps (Supabase API), custom domains, templates gallery.

---

## 3. Phase 2 — Mobile Game Pipeline (2D/3D)

### Reality check on your reference games
Clash of Clans, Star Wars: Galaxy of Heroes, and Mobile Legends are **server-backed live-service games** built by teams of 50–300 over years. Slay the Spire is closer to reach: a premium single-player game made by essentially 2 people — over 4 years. Your realistic path: start with small complete games, grow toward a Slay-the-Spire-like, and treat CoC-likes as a distant goal requiring backend multiplayer infrastructure.

### Recommended engine: Godot 4
Free, open source (fully in-house — no license fees ever), exports to Android/iOS, handles 2D and 3D, and its scripting language (GDScript) is Python-like and beginner-friendly. Unity is the alternative if you later need its asset store, but it has licensing costs and less "in-house" control.

### How AI fits in
- **Code:** Claude writes GDScript very well. Workflow: describe a mechanic → AI writes the script → paste into Godot. Later, automate with an "AI game assistant" tool built on your gateway.
- **Art:** Generate sprites/textures with image APIs (Google Imagen on Vertex, OpenAI gpt-image, or open-source Stable Diffusion run in-house). Consistent style via fixed style prompts + LoRA training later.
- **Game design/balance:** AI generates card stats, level layouts, enemy waves as JSON your game loads.

### Build order
1. **Game 1 (2 weeks):** 2D endless runner or match-3 — learn Godot end to end, ship to Play Store internal track.
2. **Game 2 (1–2 months):** Slay-the-Spire-style deckbuilder prototype — cards defined in JSON, AI-generated card art and balance.
3. **Game 3 (3–6 months):** first 3D prototype; add a backend (Nakama — open-source game server, in-house hostable) for accounts/leaderboards.
4. **Then:** evaluate a CoC-like, which mainly means multiplayer backend engineering.

---

## 4. Phase 3 — AI Video Studio (1-minute movies, consistent characters)

### The honest state of the art (verify current models when you start — this moves monthly)
No API today reliably generates a coherent 60-second video in one shot. Every serious pipeline — including what studios use — stitches **6–10 clips of 5–10 seconds**. Character consistency is the hard problem; the working techniques:

1. **Character reference images:** generate a "character sheet" once (front/side/expressions), then feed it as a reference image to image-to-video models.
2. **Image-first workflow:** generate each scene's keyframe as an image (with the character reference) → animate that image with image-to-video. Much more consistent than text-to-video.
3. **Fixed style bible:** identical character/style description text in every prompt.

### Pipeline architecture
```
Script (LLM writes 8-scene screenplay as JSON)
  → Character sheets (image model, reference-locked)
  → Scene keyframes (image model + character reference)
  → Clips (image-to-video model, 6–8s each)
  → Voice (ElevenLabs or Google TTS) + music (Suno/API or licensed)
  → Assembly (FFmpeg — free, in-house: concat, audio mix, subtitles)
```

### Providers to integrate (all through your gateway pattern)
Video: Google **Veo** (Vertex AI — you already have access), Runway API, Kling, Luma. Images: Imagen/gpt-image/Stable Diffusion. Voice: ElevenLabs. Assembly: FFmpeg runs entirely in-house and is free.

Expect roughly **$5–30 per finished minute** in API costs depending on the video model chosen.

---

## 5. The Multi-LLM Gateway (delivered today)

One module, `providers.js`, exposes a single function:

```
generate(providerName, systemPrompt, messages) → text
```

Adapters included for **Anthropic (Claude)**, **OpenAI**, and **Google Gemini** (Google AI Studio key now; a Vertex AI adapter is a small swap of URL + auth when you want enterprise billing). Adding any future provider (DeepSeek, Mistral, xAI…) = copying one ~30-line adapter and filling in the URL and payload shape. Model names are set in a config block at the top so you can update them as new models ship — no code changes.

This is the exact pattern behind products like OpenRouter, kept small enough to own and understand.

---

## 6. Costs & practical notes

- **AI API costs** are your main expense: roughly $0.01–0.10 per app generation, pennies per game-code request, dollars per video minute. Set spending limits in each provider console on day one.
- **Everything else in Phase 1 is free:** Node, Godot, FFmpeg, Capacitor are all free/open source.
- **Security:** API keys live in a `.env` file that is never shared or committed. The starter kit is for your local machine/office network; before exposing it on the public internet, add login + rate limiting (Phase 1.5).
- **App stores:** Google Play developer account $25 once; Apple $99/year.

## 7. Recommended sequence

| When | Milestone |
|---|---|
| Today | Run the starter kit, generate your first apps with all 3 providers |
| Weeks 1–4 | Use it daily; add features you find missing (deploy button, templates) |
| Month 2 | Ship first tiny Godot game to Play Store internal testing |
| Month 3 | Prototype the video pipeline: script → keyframes → 2 stitched clips |
| Months 4–6 | Deckbuilder game vertical slice; video studio v1; app builder v1.5 |
