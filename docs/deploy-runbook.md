# Deploy runbook — `designer.366industries.com`

Follow in order. Each step has a check; do not move on until it passes. Roughly 40 minutes, most of it waiting on builds and DNS.

---

## 0. Before you start

```
cd "D:\Lovable Remake"
del .git\HEAD.lock .git\index.lock .git\_probe
del creation-platform\probe.tmp.ts creation-platform\perf.tmp.ts
git commit -m "verification, version history, mobile target, deploy prep"
git push -u origin platform/step-01-03-foundations
```

Then merge that branch into `main` — Render deploys `main` by default.

✅ **Check:** GitHub shows your commits on `main`, and `render.yaml` is at the repo root.

---

## 1. Decide the plan first

`render.yaml` says `plan: starter` (~$7/month, always on). To try it free, change that one line to `plan: free` before deploying.

The free tier sleeps after ~15 minutes idle and takes about a minute to wake. For a prototype you are demoing that is fine. What it is **not** fine for: the live preview feature, which runs `npm install` inside the container — on the free tier's smaller instance that is slow, and a sleeping service that wakes mid-build will feel broken.

Recommendation: **free to prove the deploy works, then switch to starter before you rely on it.** Switching is a dropdown, not a redeploy.

---

## 2. Create the service

1. Render → **New → Blueprint**
2. Select the `366-AI-Software-Homebrew` repo
3. Render reads `render.yaml` and pre-fills: Docker runtime, `rootDir: creation-platform`, a 1 GB disk at `/app/media`, health check at `/healthz`, auto-deploy on push
4. It will prompt for every secret. Fill in at minimum:

| Variable | Where it comes from |
|---|---|
| `ACCESS_PASSWORD` | **You invent it.** Long and random — a passphrase, not a word. |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `SUPABASE_URL` | `https://ujkizgblscqcejghxemb.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase → API Keys → **Secret key** (`sb_secret_…`) |
| `SUPABASE_ANON_KEY` | Supabase → API Keys → **Publishable key** (`sb_publishable_…`) |

Optional: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `NETLIFY_TOKEN`.

Leave every `*_MAX_TOKENS` unset — the defaults are each model's documented maximum.

5. **Create Web Service.** First build takes several minutes; the image installs Python, Flask and FFmpeg.

✅ **Check:** the build log ends with `Creation Platform v2.0 is running!` and the service shows **Live**.

---

## 3. Verify on the Render URL, before touching DNS

Debugging a broken app and a broken DNS record simultaneously is miserable. Prove the app first.

```
https://<your-service>.onrender.com/healthz   → {"ok":true}
https://<your-service>.onrender.com/          → the sign-in page, NOT the builder
```

Then sign in and confirm, in this order:

1. **Storage line in the logs** reads `Supabase Postgres (cloud database)`, not local JSON. If it says JSON, `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` did not take.
2. **Accounts line** reads `Accounts: ON`. If not, `SUPABASE_ANON_KEY` is missing.
3. Generate a **🌐 Web App** — simplest target, instant preview. Proves the model key works.
4. **Save it**, then reload the page and load it back from the Load project menu. Proves Supabase writes are landing.
5. Save again and open the **🕘 History** menu. Two versions should be listed.
6. Generate a **⚛️ React App** and click **Run in browser**. First run takes about a minute. Proves the container can `npm install` and run Vite.

✅ **Check:** all six pass. If step 6 fails on the free tier, that is the instance size — switch to starter.

---

## 4. Point the domain

1. Render → your service → **Settings → Custom Domains → Add** → `designer.366industries.com`
2. Cloudflare → `366industries.com` → **DNS → Add record**:

| Type | Name | Target | Proxy |
|---|---|---|---|
| `CNAME` | `designer` | `<your-service>.onrender.com` | **DNS only** (grey cloud) |

3. Wait for propagation — usually minutes.
4. Render shows **Certificate issued**.

✅ **Check:** `https://designer.366industries.com` loads the sign-in page with a valid padlock.

### Grey cloud, not orange

Two reasons, and the second is the one that wastes an afternoon:

1. Cloudflare's proxy terminates TLS itself and will fight Render's certificate until SSL mode is *Full (strict)*.
2. **A buffering proxy breaks SSE.** This app streams generated code token by token. Buffered, that becomes one long silence followed by a wall of text — the feature still technically works, but stops feeling like the thing you built.

You can revisit orange cloud later for DDoS protection, deliberately, with SSL mode on *Full (strict)* — and re-test that code still streams live.

---

## 4b. Logging in from a phone

There is no app to install and nothing to configure. Open `https://designer.366industries.com` in the phone's browser and you land on the sign-in page.

**Which page you get depends on your env vars** — the middleware checks in this order:

| If you set | You get | How you sign in |
|---|---|---|
| `SUPABASE_ANON_KEY` (+ `SUPABASE_URL`) | **Accounts** — Sign in / Create account tabs | Your own email and password |
| Only `ACCESS_PASSWORD` | **Team password** — one box | The shared passphrase |
| Neither | No gate at all | — **never deploy like this** |

Set both and you get accounts, which is the better answer for phones: each person uses their own credentials, the browser keychain can save them, and you are not passing one shared secret around by text message.

### Make it feel like an app

After signing in, add it to the home screen — iOS Safari **Share → Add to Home Screen**, Android Chrome **⋮ → Add to Home screen**. It gets an icon and opens without browser chrome, which matters here because the header is already tight on a 360px screen.

The session cookie is `HttpOnly` with a 30-day life and refreshes silently, so you sign in once and stay signed in.

### What was fixed to make this work

The two gate pages are generated in `src/middleware/auth.ts`, not `public/index.html`, so the earlier mobile audit missed them entirely. Corrected:

| Issue | Fix |
|---|---|
| `height:100vh` — mobile browsers count the address bar, so the form sat partly off-screen | `100dvh` with a `100vh` fallback |
| Fixed `width:320px` — touched both edges on a 320px iPhone SE | `width:100%; max-width:340px` with page padding |
| White on `#6c7bff` measured **3.55:1**, failing WCAG AA | Same darkened accents as the main app: **4.68** and **4.51** |
| Inputs below 16px — iOS zooms the page on focus and the layout jumps | 16px inputs, 48px minimum tap height |
| No `autocomplete` — password managers would not offer to fill | `current-password` / `new-password` / `username`, plus `autocapitalize="none"` on the email field so iOS stops capitalising it |
| No safe-area padding | `env(safe-area-inset-*)` for notched devices |

That autocomplete change is the one that matters most in practice. `ACCESS_PASSWORD` should be a long random passphrase, and typing one of those on a phone keyboard without autofill is genuinely unpleasant.

---

## 5. Link it from the marketing page

On `366industries.com/ai-designer`, point the buttons at `https://designer.366industries.com`.

Visitors will land on the sign-in gate, not the builder. That is intended.

---

## 6. Before you tell anyone the URL

- [ ] `ACCESS_PASSWORD` set, long and random
- [ ] A private window shows the gate, not the builder
- [ ] Anthropic spend limit set — a public URL is a bigger blast radius than localhost
- [ ] **Open signups are OFF.** Hand out accounts; do not let strangers register.
- [ ] Test it on an actual phone, not a narrow desktop window

That last checkbox is not busywork. The header, viewport height and contrast fixes were all made for phones and have only been verified by measurement, never on real hardware.

---

## 7. The line you must not cross

`src/services/runner.ts` executes AI-generated code inside your container — `spawn("python3", …)`, `npm install`, `npx vite`. The `npm install` path is the sharp edge: a generated `package.json` can name any package on the public registry, and install scripts run automatically.

That is acceptable while you write the prompts and you run the code. It is not acceptable for strangers.

> 🚧 **Before anyone outside the team can type a prompt, sandboxing ships first.** Your Daytona key is already waiting. See [`roadmap.md`](roadmap.md) §0.1.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Deploy loops / "unhealthy" | Health check not on `/healthz`. Every other path returns 401 by design. |
| Logs say "local JSON files" | `SUPABASE_URL` or `SUPABASE_SERVICE_KEY` missing or misspelled. |
| Sign-in page instead of accounts | `SUPABASE_ANON_KEY` not set — that is what switches accounts mode on. |
| Code appears all at once, not streaming | Cloudflare proxy is on (orange cloud). Switch to DNS only. |
| "Run in browser" times out | Free instance too small for `npm install`. Move to starter. |
| Generated videos vanish after deploy | Only `/app/media` persists, and only with the disk attached. Projects live in Supabase and are safe. |
| 401 on everything after changing Supabase keys | You disabled legacy JWT keys before cutting over. Re-enable, switch env vars, verify, then disable. |
