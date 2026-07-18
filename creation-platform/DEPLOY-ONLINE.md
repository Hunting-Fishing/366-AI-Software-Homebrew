# Putting the Creation Platform online

Goal: use the platform from any device — phone, laptop, anywhere — protected by a team password. We deploy from your GitHub repo to **Render.com** (simple, deploys on every push, free tier available).

## Before you start (critical)

1. **Push the latest code to GitHub first** (see PUSH-TO-GITHUB.md). Render deploys whatever is in the repo.
2. **Set a strong ACCESS_PASSWORD.** Online without it, anyone who finds the URL can spend your AI credits. The platform refuses nothing locally, but online the password gate is your lock.

## Deploy on Render (~10 minutes)

1. Go to https://render.com → sign up with your **GitHub** account (that connects your repos automatically).
2. Click **New → Web Service** → select the `366-AI-Software-Homebrew` repo.
3. Settings:
   - **Root Directory:** `creation-platform` (important — the platform lives in that subfolder)
   - **Language/Environment:** Docker (Render finds the Dockerfile automatically)
   - **Instance type:** Free to try it; `Starter` (~$7/mo) to avoid the free tier's sleep-after-idle behavior.
4. Under **Environment Variables**, add (names exactly as in .env):
   - `ACCESS_PASSWORD` — your team password (required online!)
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` — same values as your local .env
   - `NETLIFY_TOKEN` — if you use the Publish button
5. Click **Create Web Service**. First build takes a few minutes.
6. Your platform is live at `https://<your-service>.onrender.com` — open it, enter the team password, build from anywhere. Every future `git push` redeploys automatically.

## Things to know

- **Free tier sleeps** after ~15 min idle; first visit after that takes ~1 min to wake. Paid tier stays on.
- **Saved projects and movie files are wiped on redeploy** (the container is ephemeral). To keep them: Render → Disks → add a 1GB disk mounted at `/app/projects` (and another at `/app/media`). This is also on the roadmap to move into a real database (Phase 3).
- **Costs:** hosting $0–7/mo; the real spend is still AI usage, same as local.
- **Security recap:** password gate ✅, HTTPS by Render ✅, API keys as env vars ✅ (never in the repo). The live-preview feature runs generated Python inside your container — fine for your own team's use; before opening the platform to strangers, that moves to isolated sandboxes (Phase 3 hard requirement in docs/PHASES.md).
- Railway.com and Fly.io work the same way with this Dockerfile if you ever prefer them.
