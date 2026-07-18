// ============================================================
// server.js — AI App Builder server
// ============================================================
// Run with:  npm start   (then open http://localhost:3000)
// ============================================================

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { generate, availableProviders } = require("./providers");

const app = express();
const PORT = process.env.PORT || 3000;
const PROJECTS_DIR = path.join(__dirname, "projects");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR);

// ---- The system prompt: the "secret sauce" -----------------
// This is what turns a general AI into an app builder.
const SYSTEM_PROMPT = `You are an expert app developer inside an AI app-builder product.

RULES — follow every one:
1. Output ONE complete, self-contained HTML file. All CSS in a <style> tag, all JavaScript in a <script> tag. No external files, no build steps.
2. External libraries are allowed ONLY from https://cdnjs.cloudflare.com.
3. The app must be mobile-responsive (looks great on phones AND desktops). Use a mobile-first layout and a <meta name="viewport"> tag.
4. Make it beautiful and modern: thoughtful color palette, spacing, rounded corners, subtle shadows and transitions. Never output an unstyled page.
5. Make it actually WORK. Every button does something. Use realistic sample data where data is needed.
6. Do not use localStorage or sessionStorage; keep state in JavaScript variables.
7. When the user asks for a CHANGE to an existing app, output the FULL updated HTML file again — never a snippet or a diff.
8. Respond with ONLY the HTML code. No explanations, no markdown fences. Start with <!DOCTYPE html>.`;

// Pull clean HTML out of the model's reply (models sometimes
// wrap code in ```html fences despite instructions).
function extractHtml(text) {
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  let code = fence ? fence[1] : text;
  const start = code.indexOf("<!DOCTYPE");
  if (start > 0) code = code.slice(start);
  return code.trim();
}

// ---- API routes -------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ ok: true, providers: availableProviders() });
});

// Generate a new app, or edit the current one.
// Body: { provider, prompt, currentCode (optional) }
app.post("/api/generate", async (req, res) => {
  try {
    const { provider, prompt, currentCode } = req.body;
    if (!provider || !prompt) {
      return res.status(400).json({ error: "provider and prompt are required" });
    }
    const messages = [];
    if (currentCode) {
      messages.push({ role: "user", content: "Here is my current app:\n\n" + currentCode });
      messages.push({ role: "assistant", content: "Understood. What would you like to change?" });
      messages.push({ role: "user", content: prompt });
    } else {
      messages.push({ role: "user", content: "Build this app: " + prompt });
    }
    const raw = await generate(provider, SYSTEM_PROMPT, messages);
    res.json({ code: extractHtml(raw) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Save a project.  Body: { name, code, prompt }
app.post("/api/projects", (req, res) => {
  const { name, code, prompt } = req.body;
  if (!name || !code) return res.status(400).json({ error: "name and code are required" });
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + "-" + Date.now();
  fs.writeFileSync(
    path.join(PROJECTS_DIR, id + ".json"),
    JSON.stringify({ id, name, prompt, code, savedAt: new Date().toISOString() }, null, 2)
  );
  res.json({ id });
});

// List saved projects.
app.get("/api/projects", (req, res) => {
  const projects = fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), "utf8"));
      return { id: p.id, name: p.name, savedAt: p.savedAt };
    })
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  res.json(projects);
});

// Load one project.
app.get("/api/projects/:id", (req, res) => {
  const file = path.join(PROJECTS_DIR, path.basename(req.params.id) + ".json");
  if (!fs.existsSync(file)) return res.status(404).json({ error: "not found" });
  res.json(JSON.parse(fs.readFileSync(file, "utf8")));
});

app.listen(PORT, () => {
  console.log("");
  console.log("  ✅ AI App Builder is running!");
  console.log(`  👉 Open http://localhost:${PORT} in your browser`);
  console.log("");
  for (const p of availableProviders()) {
    console.log(`     ${p.configured ? "🟢" : "⚪"} ${p.label} ${p.configured ? "(" + p.model + ")" : "— no API key in .env yet"}`);
  }
  console.log("");
});
