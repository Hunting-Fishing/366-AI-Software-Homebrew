// ============================================================
// Creation Platform — server entry point
// Run:  npm start   →  http://localhost:3000
// ============================================================

import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { availableProviders } from "./providers/index.js";
import { listTargets } from "./targets.js";
import { JsonProjectStore } from "./services/projects.js";
import { SupabaseProjectStore, supabaseConfigured } from "./services/supabase.js";
import { generateRouter } from "./routes/generate.js";
import { brainRouter } from "./routes/brain.js";
import { projectsRouter } from "./routes/projects.js";
import { previewRouter } from "./routes/preview.js";
import { imageRouter } from "./routes/image.js";
import { publishRouter } from "./routes/publish.js";
import { videoRouter } from "./routes/video.js";
import { availableVideoProviders } from "./providers/videos.js";
import { FAILURES } from "./failures.js";
import { integrationsRouter } from "./routes/integrations.js";
import { canExecute } from "./services/sandbox.js";
import { ROLES, TIERS, MODELS, modelForTier, type Tier } from "./models.js";
import { streamGenerate } from "./providers/index.js";
import { CONNECTORS, CATEGORIES } from "./connectors.js";
import { projectHealth, refactorPrompt, FILE_LIMIT, FILE_COMFORTABLE, FN_COMFORTABLE } from "./codeHealth.js";
import type { ProjectFile } from "./lib/files.js";
import { extractContracts, contractBrief } from "./services/contracts.js";
import { ffmpegAvailable, MEDIA_DIR } from "./services/studio.js";
import { authMiddleware, loginHandler } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { accountsEnabled } from "./services/auth.js";
import { availableImageProviders } from "./providers/images.js";
import { runDoctor } from "./doctor.js";
import { liveRouter, attachLiveWebSocketProxy } from "./routes/live.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Explain the setup before doing anything else. Exits with a readable
// message rather than a stack trace when something required is missing.
if (!runDoctor()) process.exit(1);

const app = express();
// Phase 3: real database when Supabase is configured; JSON files otherwise.
const store = supabaseConfigured() ? new SupabaseProjectStore() : new JsonProjectStore();

app.use(authMiddleware);

// Mounted BEFORE express.json() on purpose: the preview proxy pipes the
// raw request body upstream, and a body parser would have consumed it.
app.use(liveRouter);

app.use(express.json({ limit: "10mb" }));
app.post("/api/login", loginHandler);
app.use(authRouter());
app.use(express.static(path.join(__dirname, "..", "public")));

// Platform health check. Unauthenticated by design (see auth.ts), so
// it must never report anything about configuration. Render polls this.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// Richer health data — stays behind auth, because it reports which
// providers have keys configured.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    providers: availableProviders(),
    targets: listTargets(),
    imageProviders: availableImageProviders(),
    videoProviders: availableVideoProviders(),
    ffmpeg: ffmpegAvailable(),
    // So the UI can say WHY a Python preview will not start, before
    // someone waits for a build to find out.
    execution: canExecute(),
    // Which model does which job. The defaults, before any override
    // the browser holds — see src/models.ts.
    roles: ROLES,
    tiers: TIERS,
    models: MODELS,
  });
});

// The failure catalogue, so the browser can name a raw error rather
// than echoing a stack trace at someone who did not write the code.
// Regexes do not survive JSON, so they go over as source + flags.
app.get("/api/failures", (_req, res) => {
  res.json(
    FAILURES.map((f) => ({
      id: f.id,
      area: f.area,
      title: f.title,
      cause: f.cause,
      fix: f.fix,
      status: f.status,
      signature: f.signature ? { source: f.signature.source, flags: f.signature.flags } : null,
    }))
  );
});

// The connector catalogue. Everything, with honest status — a "soon"
// entry links out to the service so the card is useful today even
// though the integration is not.
app.get("/api/connectors", (_req, res) => {
  res.json({ connectors: CONNECTORS, categories: CATEGORIES });
});

// Size report for a project. Computed here rather than in the browser
// so there is one implementation of the rule, not two that drift.
app.post("/api/code-health", (req, res) => {
  const { files } = req.body as { files?: ProjectFile[] };
  const health = projectHealth(files ?? []);
  res.json({
    ...health,
    limits: { file: FILE_LIMIT, comfortable: FILE_COMFORTABLE, fn: FN_COMFORTABLE },
    // The prompt that fixes the worst one, ready to send — with the
    // project's contracts attached. A model splitting a 700-line file
    // has no way to know that 'employees' is a storage key rather than
    // a variable name unless it is told.
    refactor: health.worst[0]
      ? refactorPrompt(health.worst[0]) + "\n\n" + contractBrief(extractContracts(files ?? []))
      : null,
  });
});

// Prove a provider works without spending a build on finding out.
// Sends a handful of tokens and reports exactly what came back — which
// matters most when credits are the reason you are switching provider.
app.post("/api/models/test", async (req, res) => {
  const { provider, tier } = req.body as { provider?: string; tier?: string };
  const t = (TIERS.find((x) => x.id === tier)?.id ?? "fast") as Tier;
  const p = provider && provider in MODELS ? provider : "anthropic";
  const model = modelForTier(p, t);
  const started = Date.now();
  try {
    let out = "";
    for await (const chunk of streamGenerate(p, "Reply with the single word: ready", [
      { role: "user", content: "ping" },
    ], model)) {
      out += chunk;
      if (out.length > 40) break;   // no need to pay for more than proof
    }
    res.json({ ok: true, provider: p, tier: t, model, ms: Date.now() - started, reply: out.trim().slice(0, 60) });
  } catch (err) {
    res.json({
      ok: false, provider: p, tier: t, model, ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.use(generateRouter);
app.use(brainRouter);
app.use(projectsRouter(store));
app.use(integrationsRouter);
app.use(previewRouter);
app.use(imageRouter);
app.use(publishRouter);
app.use(videoRouter);
app.use("/media", express.static(MEDIA_DIR));

const server = app.listen(config.port, () => {
  console.log("");
  console.log("  ✅ Creation Platform v2.0 is running!");
  console.log(`  👉 Open http://localhost:${config.port} in your browser`);
  console.log("");
  for (const p of availableProviders()) {
    console.log(
      `     ${p.configured ? "🟢" : "⚪"} ${p.label} ` +
        (p.configured ? `(${p.model})` : "— no API key in .env yet")
    );
  }
  console.log("");
});

// Vite's hot reload speaks WebSocket, which Express does not handle.
attachLiveWebSocketProxy(server);
