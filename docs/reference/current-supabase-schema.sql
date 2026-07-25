-- ─────────────────────────────────────────────────────────────
-- REFERENCE ONLY — do not run this file.
--
-- Snapshot of the live schema in project ujkizgblscqcejghxemb
-- ("366-AI-Software-Homebrew") as read on 2026-07-25.
--
-- Applied migrations on the remote at time of snapshot:
--   20260719053656_create_projects_table
--   20260719065219_phase_3_3_user_accounts
--
-- To get real, runnable migration files locally, run:
--   supabase link --project-ref ujkizgblscqcejghxemb
--   supabase db pull
-- ─────────────────────────────────────────────────────────────

-- ─── public.profiles ─────────────────────────────────────────
-- One row per authenticated user. Mirrors auth.users.

create table public.profiles (
  id           uuid        primary key references auth.users (id),
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "own profile update"
  on public.profiles for update
  using (auth.uid() = id);

-- NOTE: there is no INSERT policy on profiles. Rows are created by the
-- SECURITY DEFINER function public.handle_new_user(), which exists on the
-- remote. See the security findings at the bottom of this file — that
-- function is currently reachable as a public REST endpoint.


-- ─── public.projects ─────────────────────────────────────────
-- One row per generated app. `files` holds the virtual filesystem the
-- agent edits; `code` is the flattened entry point; `binaries` holds
-- references to assets in Supabase Storage.

create table public.projects (
  id        text        primary key,
  name      text        not null,
  prompt    text        default ''::text,
  target    text        default 'web'::text,
  code      text        default ''::text,
  files     jsonb       default '[]'::jsonb,
  binaries  jsonb       default '[]'::jsonb,
  saved_at  timestamptz default now(),
  user_id   uuid        references auth.users (id)
);

alter table public.projects enable row level security;

create policy "own projects select"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "own projects insert"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "own projects update"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "own projects delete"
  on public.projects for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- ADDED 2026-07-25 — migration `phase_1_5_project_versions`
--
-- create table public.project_versions (
--   id          bigint generated always as identity primary key,
--   project_id  text        not null references public.projects (id) on delete cascade,
--   version     integer     not null,
--   label       text,
--   prompt      text        not null default '',
--   target      text        not null default 'web',
--   code        text        not null default '',
--   files       jsonb       not null default '[]'::jsonb,
--   binaries    jsonb       not null default '[]'::jsonb,
--   user_id     uuid        references auth.users (id),
--   created_at  timestamptz not null default now(),
--   unique (project_id, version)
-- );
--
-- RLS on, owner-only SELECT / INSERT / DELETE. Deliberately NO update
-- policy: versions are immutable once written. Restoring copies a
-- snapshot forward as a new version rather than mutating history, so an
-- undo can itself be undone.
--
-- Also added in the same migration:
--   create index projects_user_idx on public.projects (user_id);
-- which closes open question 4 below — "list my projects" was a
-- sequential scan.
--
-- Verified on the live database 2026-07-25: insert round-trip, the
-- unique(project_id, version) constraint rejects duplicates, and
-- deleting a project cascades its versions away. Probe rows removed;
-- both tables back to 0 rows.


-- ─────────────────────────────────────────────────────────────
-- ✅ RESOLVED 2026-07-25 — migration `revoke_public_execute_on_definer_functions`
--
--   revoke execute on function public.handle_new_user() from anon, authenticated, public;
--   revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
--
-- get_advisors(security) now returns zero lints. Both triggers verified
-- still attached and enabled after the revoke:
--   on_auth_user_created  AFTER INSERT ON auth.users  → handle_new_user()
--   ensure_rls            EVENT TRIGGER ddl_command_end → rls_auto_enable()
--
-- CORRECTION TO THE ORIGINAL ASSESSMENT (recorded honestly):
-- These were first written up as a serious exposure. They were not.
-- Both functions RETURN trigger / event_trigger, and Postgres refuses a
-- direct invocation before executing any of the body. Verified by
-- calling them:
--
--   select public.handle_new_user();
--   ERROR: 0A000: trigger functions can only be called as triggers
--
--   select public.rls_auto_enable();
--   ERROR: 0A000: trigger functions can only be called as triggers
--
-- Both also already carried an explicit `SET search_path`, so the
-- search-path-hijack remediation suggested below was redundant too.
--
-- The lints were TRUE POSITIVES about a grant that should not exist,
-- but the practical exploitability was nil. The revoke is defence in
-- depth: it costs nothing and protects against a future rewrite that
-- changes either function's return type.
--
-- Original write-up retained below for the reasoning.
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- SECURITY FINDINGS — from `get_advisors(type: security)`, 2026-07-25
--
-- Four WARN-level lints, all the same root cause: two SECURITY DEFINER
-- functions are exposed through the auto-generated REST API and are
-- callable by BOTH the `anon` and `authenticated` roles:
--
--   POST /rest/v1/rpc/handle_new_user
--   POST /rest/v1/rpc/rls_auto_enable
--
-- SECURITY DEFINER means the function runs with the privileges of its
-- owner (postgres), not the caller. A trigger helper like
-- handle_new_user() is meant to be invoked by the auth system, never by
-- a random unauthenticated HTTP request. rls_auto_enable() is worse —
-- anything that toggles RLS should be unreachable from the public API.
--
-- Fix in Step 2 (do not run blind — confirm each function's body first):
--
--   revoke execute on function public.handle_new_user()  from anon, authenticated;
--   revoke execute on function public.rls_auto_enable()  from anon, authenticated;
--
-- Triggers still fire after REVOKE — trigger execution does not go
-- through the caller's EXECUTE privilege — so revoking is safe for
-- handle_new_user()'s actual job.
--
-- Also set an explicit search_path on both functions to close the
-- search-path-hijack vector that SECURITY DEFINER functions are prone to:
--
--   alter function public.handle_new_user() set search_path = public, pg_temp;
--
-- Reference:
-- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
-- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable


-- ─────────────────────────────────────────────────────────────
-- OPEN QUESTIONS TO RESOLVE IN STEP 2
--
-- 1. projects.user_id is nullable. A null user_id makes every RLS policy
--    fail closed (auth.uid() = null is never true), so such rows become
--    invisible to everyone including their owner. Consider NOT NULL.
--
-- 2. projects.id is text, not uuid. Fine if the app generates slugs,
--    but there is no uniqueness/format constraint. Worth a check.
--
-- 3. No updated_at column and no trigger. saved_at defaults to now() but
--    will not change on UPDATE.
--
-- 4. No index on projects.user_id. Every "list my projects" query will
--    seq-scan once the table grows.
--
-- 5. projects.files and projects.binaries are unbounded jsonb. A large
--    generated app could push a single row past Postgres' practical
--    limits. Step 2 should decide: keep files in jsonb, or move them to
--    Supabase Storage and keep only pointers here.
-- ─────────────────────────────────────────────────────────────
