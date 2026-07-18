# Architecture Decision Record — Tech Stack

**Decision date:** July 18, 2026 · **Status:** Accepted

## What the products we admire are actually built with

| Product | Known/likely stack | Lesson for us |
|---|---|---|
| Lovable.dev | TypeScript, React/Next.js frontend, Node services, Supabase (Postgres) for generated apps | TS everywhere; rent the database layer |
| Bolt.new | TypeScript, Remix/React, **WebContainers** (StackBlitz's in-browser Node runtime), streaming UI | Streaming + in-browser execution is the magic feel |
| Replit | TS/Go frontend+infra, **Firecracker microVMs** for sandboxing | Real code execution needs serious sandboxing (Phase 3, not now) |
| Dyad (open source) | TypeScript, Electron + React, runs **locally** with your own API keys | Closest to our "for ourselves first" model — validates our local-first start |
| Leonardo/Midjourney | Python ML infra behind simple web/Discord frontends | Image/video = pipeline orchestration, not model training |

**The consistent answer: TypeScript + Node.js + React.** One language across server, UI, and generated apps; the largest AI-tooling ecosystem; what every reference product chose.

## Decisions

**D1 — Language: TypeScript (strict mode).** JavaScript with a type-checker that catches bugs before running. Our v0.1 JS prototype is retired to reference status.

**D2 — Runtime/server: Node.js 18+ with Express.** Boring, documented everywhere, and what our team can realistically operate. NestJS/Fastify add ceremony we don't need yet.

**D3 — Frontend now: zero-build HTML/JS served by our server. Frontend at Phase 3: Next.js + React.** Reasoning: a build pipeline (bundlers, hydration, deployments) is real overhead. We adopt it when we have multi-user needs, not before. The UI code is written so its logic ports straight into React components later.

**D4 — Streaming via Server-Sent Events (SSE).** All three provider APIs stream over SSE natively; browsers consume it without libraries. WebSockets deferred until we need two-way traffic (collaboration).

**D5 — Provider access: direct HTTPS, no vendor SDKs.** Three ~60-line adapters we fully own and can debug; adding a provider = one file. (Revisit if we adopt tool-calling/agents heavily — then official SDKs earn their keep.)

**D6 — Storage: JSON files behind a `ProjectStore` interface → Postgres (via Prisma) at Phase 3.** The interface means swapping storage touches one file. No native modules (SQLite bindings etc.) that break on Windows for a beginner team.

**D7 — Generated-app execution: sandboxed `<iframe srcdoc sandbox="allow-scripts">`.** Safe for single-file apps. Multi-file/server code execution (the Replit problem) is deliberately deferred to Phase 3 — it is the single most dangerous and expensive feature; do not improvise it.

**D8 — Games: Godot 4 (GDScript), not Unity.** Free forever, no licensing risk, fully in-house, exports to both stores. **D9 — Video: rent models (Veo/Runway/Kling), own the pipeline (FFmpeg, prompts, character system).**

**D10 — Quality gate:** `tsc --noEmit` type-check + `node:test` unit tests must pass before any phase is declared done. CI (GitHub Actions) once the repo is on GitHub.

## Consequences

Positive: one language everywhere; no framework churn for beginners; every piece replaceable without rewrites; nothing rented that locks us in.
Accepted costs: no multi-user auth until Phase 3; single-file apps only until Phase 2; JSON storage won't survive heavy concurrent use (fine for one team).
