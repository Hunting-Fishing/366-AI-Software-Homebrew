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
import { projectsRouter } from "./routes/projects.js";
import { previewRouter } from "./routes/preview.js";
import { imageRouter } from "./routes/image.js";
import { publishRouter } from "./routes/publish.js";
import { videoRouter } from "./routes/video.js";
import { availableVideoProviders } from "./providers/videos.js";
import { ffmpegAvailable, MEDIA_DIR } from "./services/studio.js";
import { authMiddleware, loginHandler } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { accountsEnabled } from "./services/auth.js";
import { availableImageProviders } from "./providers/images.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Phase 3: real database when Supabase is configured; JSON files otherwise.
const store = supabaseConfigured() ? new SupabaseProjectStore() : new JsonProjectStore();
console.log(supabaseConfigured()
  ? "  🗄  Storage: Supabase Postgres (cloud database)"
  : "  🗄  Storage: local JSON files (add Supabase keys for cloud storage — see SETUP-SUPABASE.md)");
console.log(accountsEnabled()
  ? "  👤 Accounts: ON — per-user sign-in via Supabase Auth"
  : "  👤 Accounts: off (add SUPABASE_ANON_KEY to enable — see SETUP-SUPABASE.md)");

app.use(express.json({ limit: "10mb" }));
app.use(authMiddleware);
app.post("/api/login", loginHandler);
app.use(authRouter());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    providers: availableProviders(),
    targets: listTargets(),
    imageProviders: availableImageProviders(),
    videoProviders: availableVideoProviders(),
    ffmpeg: ffmpegAvailable(),
  });
});

app.use(generateRouter);
app.use(projectsRouter(store));
app.use(previewRouter);
app.use(imageRouter);
app.use(publishRouter);
app.use(videoRouter);
app.use("/media", express.static(MEDIA_DIR));

app.listen(config.port, () => {
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
