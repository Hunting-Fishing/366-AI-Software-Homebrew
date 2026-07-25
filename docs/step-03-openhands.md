# Step 3 — Lane B: the OpenHands agent

**Written:** 25 July 2026
**Status:** adapter built and merged; **not yet run against a live agent-server**
**Code:** `creation-platform/src/lanes/openhands.ts`

---

## 3.0 What this buys, and what it does not

Lane A re-sends the whole project on every edit and asks for the whole project back. Beyond a certain size that stops working — you cannot build something over forty edits if edit #40 can quietly undo edit #12.

Lane B routes **edits** to an OpenHands agent, which is built for iterative work on an existing codebase. First generation stays on Lane A, and so does everything only Lane A understands: Godot, books, video.

**Be clear-eyed about this first version.** It is genuinely useful and genuinely incomplete:

| | Status |
|---|---|
| Better editing behaviour from a stronger agent loop | ✅ Yes |
| Only changed files come back, merged over the originals | ✅ Yes |
| Conversation continuity across edits to the same project | ✅ Yes |
| Live token-by-token streaming | ❌ **No** — see below |
| Files in a real agent workspace instead of the prompt | ❌ **Not yet** — see below |

### Why no streaming

The agent-server's OpenAI-compatible gateway rejects `stream: true` with a `400`. So Lane B shows a spinner and then the finished result, where Lane A types the code out live. That is a real UX regression on edits, and the honest reason to keep this optional for now.

Restoring streaming means moving to the native conversation API and its event WebSocket. That is the next iteration.

### Why the prompt, not a workspace

The gateway has no file-upload channel. Lane B therefore still sends the project as text — so it does not yet deliver the *smaller payload* half of the benefit, only the *better editing* half. Real workspace upload needs the native API (`workspace.file_upload`).

> Both of these point the same direction: **the native agent-server API is the destination, and the OpenAI gateway is the on-ramp.** The gateway was chosen first because it is fully documented with working examples, so the adapter could be written correctly rather than guessed at.

---

## 3.1 Install the agent server

Requires **Python 3.12+** and `uv`. This does not have to be the same machine as the platform — set `OPENHANDS_SERVER_URL` to wherever it runs.

```bash
# uv (installs its own Python if needed)
curl -LsSf https://astral.sh/uv/install.sh | sh      # macOS / Linux
# powershell -c "irm https://astral.sh/uv/install.ps1 | iex"   # Windows

uv python install 3.12
uv venv --python 3.12
uv pip install openhands-agent-server
```

Run it:

```bash
uv run openhands-agent-server
```

Confirm it is alive:

```bash
curl http://localhost:8000/alive
```

Docker is the alternative if you would rather not manage Python — the project publishes `ghcr.io/openhands/agent-server:latest-python`.

---

## 3.2 Point the platform at it

Add to `creation-platform/.env`:

```bash
OPENHANDS_SERVER_URL=http://localhost:8000
OPENHANDS_PROFILE=creation_platform
OPENHANDS_LLM_MODEL=anthropic/claude-sonnet-4-5
# OPENHANDS_LLM_API_KEY=          # defaults to ANTHROPIC_API_KEY
# OPENHANDS_SESSION_API_KEY=      # only if the server was started with auth
# OPENHANDS_TIMEOUT_MS=600000
```

Restart the platform. The LLM profile that backs the gateway model is created automatically on first use — no manual `curl` needed.

Model names follow the **LiteLLM convention**: `provider/model`. `claude-sonnet-4-5` alone will not resolve; `anthropic/claude-sonnet-4-5` will.

---

## 3.3 Confirming it is actually being used

The route logs its decision on every request:

```
[generate] target=react mode=edit lane=openhands
```

If the server is unreachable you will see the fallback instead, and **the user's request still completes**:

```
[generate] target=react mode=edit lane=openhands
[lanes] openhands declined (OpenHands server unreachable at http://localhost:8000: fetch failed) — falling back to inhouse
```

That behaviour is verified — a request against a dead port completes normally through Lane A.

---

## 3.4 The routing table

| Target | Create | Edit |
|---|---|---|
| `web` | Lane A | **Lane B** |
| `react` | Lane A | **Lane B** |
| `flutter` | Lane A | **Lane B** |
| `python` | Lane A | **Lane B** |
| `godot` | Lane A | Lane A |
| `book` | Lane A | Lane A |
| `video` | Lane A | Lane A |

With `OPENHANDS_SERVER_URL` unset, every cell reads Lane A and the platform behaves exactly as it did before.

---

## 3.5 Two bugs worth knowing about

Both were found by a smoke test against a dead server, and neither showed up in unit tests until tests were written for them. They are the two ways this lane could have silently made things worse.

**1. A dead server raised the wrong error type.** A bare `fetch` to an unreachable host rejects with `TypeError("fetch failed")`. The router only falls back on `LaneUnavailableError`, so a stopped agent-server surfaced as a hard error to the user rather than a silent recovery. Every outbound call now goes through a `laneFetch` wrapper that converts network failures.

**2. A status message broke the fallback.** The lane originally yielded *"Handing this edit to the OpenHands agent…"* before making the request. The router can only fall back while a lane has emitted **zero** events — otherwise it would replay chunks into a view that already has content. That one friendly line turned every server outage into a hard failure. Lane B now emits nothing until the server has responded.

Both have regression tests in `tests/openhands.test.ts`.

---

## 3.6 Next iteration

1. **Native conversation API instead of the gateway** — restores streaming via the event WebSocket, and unlocks file upload.
2. **Real workspace materialisation** — `ProjectFile[]` written into the agent's workspace, changed files read back out. This is where the cost saving actually arrives.
3. **Pass `projectId` from the browser** — the adapter already keys conversation continuity on it; the client does not send it yet, so all edits currently share one conversation per server restart.
4. **Surface tool activity** — the gateway returns final text only. The native API exposes the agent's actual steps, which is far better feedback than a spinner.

---

## Sources

- [OpenHands — OpenAI-compatible endpoint](https://docs.openhands.dev/sdk/guides/agent-server/openai-gateway) — profile creation, `X-OpenHands-ServerConversation-ID`, the no-streaming limitation
- [OpenHands — Agent server overview](https://docs.openhands.dev/sdk/guides/agent-server/overview) — workspace model, file and command operations
- [OpenHands — Local agent server](https://docs.openhands.dev/sdk/guides/agent-server/local-server)
- [OpenHands — `/alive`](https://docs.openhands.dev/sdk/guides/agent-server/api-reference/server-details/alive)
- [`OpenHands/software-agent-sdk`](https://github.com/OpenHands/software-agent-sdk) — v1.36.1, 15 Jul 2026
