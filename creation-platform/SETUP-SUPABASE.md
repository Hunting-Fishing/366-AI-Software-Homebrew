# Connecting your Supabase database (~5 minutes)

Your project: https://supabase.com/dashboard/project/ujkizgblscqcejghxemb

## Step 1 — Create the projects table

In your Supabase dashboard, open **SQL Editor** (left sidebar) → **New query**, paste this, and click **Run**:

```sql
create table if not exists projects (
  id text primary key,
  name text not null,
  prompt text default '',
  target text default 'web',
  code text default '',
  files jsonb default '[]',
  binaries jsonb default '[]',
  saved_at timestamptz default now()
);

alter table projects enable row level security;
```

(Row level security ON with no public policies means only our server — using the service key — can touch the data. Per-user access rules come with accounts in Phase 3.3.)

## Step 2 — Get your keys

Dashboard → **Settings** (gear) → **API**:

- Copy the **service_role** key (under "Project API keys" — click reveal). This is a SECRET like your AI keys — never share it or commit it.

## Step 3 — Add to .env

Open your `.env` file and add:

```
SUPABASE_URL=https://ujkizgblscqcejghxemb.supabase.co
SUPABASE_SERVICE_KEY=paste-the-service_role-key-here
```

## Step 4 — Restart and confirm

Restart the server (`Ctrl+C`, then `npm start`). You should see:

```
🗄  Storage: Supabase Postgres (cloud database)
```

Save a project in the platform, then check Supabase → **Table Editor** → projects — your project appears as a database row. Your work now survives redeploys, and the same database serves the platform whether it runs on your PC or on Render (add the same two env vars in Render's dashboard).

## Step 5 — Turn on user accounts (Phase 3.3)

Add one more line to `.env` (this key is *publishable* — safe to expose, unlike the service key):

```
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqa2l6Z2Jsc2NxY2VqZ2h4ZW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTIzMTYsImV4cCI6MjA5OTk4ODMxNn0.7wRBqgT0w-nEaxDVXjkYIlE0PFetqRiTv4YzwkPEaQM
```

Restart. You'll see `👤 Accounts: ON`, and the platform now shows a **Sign in / Create account** page instead of the team password. Each person gets their own account and sees only their own projects. `ACCESS_PASSWORD` is ignored while accounts are on — you can delete it from .env.

Notes:
- **Email confirmation is ON** for this Supabase project: new signups get a "confirm your email" message and must click the link before signing in. To let people in instantly instead, turn it off in the dashboard: **Authentication → Sign In / Providers → Email → Confirm email → off**.
- Database side is already set up (done in Phase 3.3): `user_id` column on projects, a `profiles` table auto-filled on signup, and owner-only row security policies.
- Projects saved before accounts existed have no owner; they stay visible only when running without accounts (remove SUPABASE_ANON_KEY temporarily to see them, or assign them an owner with one SQL update).

## Troubleshooting

- **"relation projects does not exist"** → Step 1 SQL wasn't run.
- **HTTP 401** → wrong key; make sure it's the **service_role** key, not the anon key.
- Want to go back to local files? Just remove the two lines from .env.
