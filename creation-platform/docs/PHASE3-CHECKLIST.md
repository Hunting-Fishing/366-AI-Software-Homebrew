# Starting Phase 3 — "For the World" Checklist

Phase 3 turns the platform from *our tool* into *a product others can use*. Here's exactly what you need to do before and during kickoff.

## Do these BEFORE the first Phase 3 build session (your homework)

1. **Push the latest code** (push-github.bat) — Phase 3 starts from the repo.
2. **Create a Supabase account** (supabase.com, free tier) — this gives us Postgres (real database) + built-in user accounts (email/Google login) in one service. Just create the account and a project named `creation-platform`; I'll wire it up.
3. **Decide the business basics** (a 30-minute team conversation):
   - Free for friends, or paid from day one? (If paid → create a Stripe account, stripe.com)
   - What do users get free vs. paid? (e.g. 5 generations/day free)
   - A product name + buy the domain (~$12/yr, e.g. on Namecheap/Cloudflare)
4. **Budget check:** Phase 3 running costs ≈ Render Starter $7/mo + Supabase free→$25/mo at scale + your AI usage (which now becomes *users'* usage — metering it is a Phase 3 feature, not optional).
5. **Deploy what exists** per DEPLOY-ONLINE.md if you haven't — Phase 3 iterates on a live URL.

## What I'll build in Phase 3 (in order)

1. **User accounts** (Supabase Auth) replacing the shared password
2. **Postgres storage** via the existing ProjectStore interface (projects, per-user)
3. **Usage metering + limits** (per-user daily/monthly caps so nobody drains your API keys)
4. **Job queue** for long work (movies, builds) so the server stays responsive
5. **Real sandboxing** for the preview runners (Docker isolation — the hard security requirement before strangers run generated code)
6. **Billing** (Stripe) if you chose paid
7. **Polish for strangers:** onboarding, error messages, terms/privacy pages

## The one rule

Nothing opens to the public until item 5 (sandboxing) is done. Everything else can go live for invited friends behind their own accounts.
