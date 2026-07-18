# ⚡ Creation Platform (v0.2)

The professional TypeScript core of our in-house AI creation platform. Today: an AI app builder (Lovable/Bolt-style) with **live streaming generation** from Claude, ChatGPT, or Gemini. Tomorrow: the game tools and video studio plug into the same gateway.

**Read first:** `docs/PHASES.md` (the plan of record) and `docs/TECH-STACK.md` (why every technology was chosen).

## Setup

1. Install Node.js LTS from https://nodejs.org (one time).
2. Copy `.env.example` → rename the copy to exactly `.env` → paste your API keys (see links inside the file). Set spending limits in each provider console.
3. In a terminal in this folder:

```
npm install
npm start
```

Open **http://localhost:3000**. You'll watch the AI write your app's code live, then it renders in the preview.

## Quality gate (run before calling any change "done")

```
npm run check   # TypeScript type-check — catches bugs without running
npm test        # unit tests
```

Both must pass. This is working rule #2 in docs/PHASES.md.

## Project structure

```
creation-platform/
├── docs/
│   ├── PHASES.md          ← phased requirements record (the plan)
│   └── TECH-STACK.md      ← architecture decision record (the why)
├── src/
│   ├── server.ts          ← entry point: wires everything together
│   ├── config.ts          ← models, port, and the system prompt (the product's brain)
│   ├── lib/
│   │   ├── sse.ts         ← shared streaming reader
│   │   └── extract.ts     ← cleans model output into pure HTML
│   ├── providers/         ← THE MULTI-LLM GATEWAY
│   │   ├── types.ts       ← the contract all adapters implement
│   │   ├── anthropic.ts   ← Claude adapter (streaming)
│   │   ├── openai.ts      ← ChatGPT adapter (streaming)
│   │   ├── google.ts      ← Gemini adapter (streaming)
│   │   └── index.ts       ← registry: add new providers here
│   ├── routes/
│   │   ├── generate.ts    ← POST /api/generate (SSE stream to browser)
│   │   └── projects.ts    ← save/list/load projects
│   └── services/
│       └── projects.ts    ← storage behind an interface (JSON now, Postgres later)
├── public/index.html      ← the UI (ports to React/Next.js at Phase 3)
└── tests/                 ← unit tests (npm test)
```

## How to extend it

- **Improve generations:** edit `APP_BUILDER_SYSTEM_PROMPT` in `src/config.ts`.
- **Add an AI provider:** copy any file in `src/providers/`, adjust URL/payload, register it in `providers/index.ts`.
- **New models released:** set `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GOOGLE_MODEL` in `.env`.
- **Swap storage to Postgres (Phase 3):** implement `ProjectStore` from `src/services/projects.ts` with Prisma; change one line in `server.ts`.

## Security notes

- `.env` is secret. Never commit or share it.
- This server is for your local machine/office network. Before exposing it to the internet: add authentication, rate limiting, and HTTPS (Phase 3 requirements in docs/PHASES.md).
- Generated apps run in a sandboxed iframe (`sandbox="allow-scripts"`) — they cannot touch your files or cookies.
