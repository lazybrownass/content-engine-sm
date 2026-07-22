# LinkedIn Content Engine

**Feed it what you've actually done. Get back what you should actually post.**

You did the work — shipped the feature, landed the client, learned the hard lesson. Content Engine turns that raw material into LinkedIn posts that sound like you, grounded in things that actually happened, reviewed by a merciless in-house editor before you ever see them. No blank page. No generic "5 tips" filler. No AI slop with your name on it.

It's a single-owner internal tool — built for exactly one person to run their own content pipeline, not a SaaS, not multi-tenant, not trying to be everything. Full spec lives in `docs/` (PRD, TRD, App Flow, UI/UX brief, backend schema, implementation plan) and `ai/AGENTS.md` (agent operating rules) for anyone extending it.

## What it actually does

**Remembers everything, so you don't have to.** The Knowledge Base is where your projects, case studies, client wins, lessons learned, and half-formed ideas live — tagged by category and content pillar, hybrid full-text + semantic search (pgvector embeddings + cross-encoder reranking) so "that thing with the latency fix" finds the right note even if you never used the word "latency."

**Suggests what to write about — from your own knowledge, not thin air.** Hit "Generate suggestions" on `/topics` and it reads your knowledge coverage (which pillars are stacked, which are thin), avoids repeating what you've already posted, and proposes 5–10 grounded topic ideas with a rationale and a confidence score for each. Accept one, reject one, edit one — every suggestion traces back to the specific knowledge it drew from.

**Writes a full draft — and then argues with itself about it.** Accept a topic and it runs outline → draft → **Grill**, a self-critique pass that scores the draft against your brand voice and flags fabricated claims or forbidden words. If it scores low, it rewrites itself once, automatically, before ever bothering you. You get a quality score and a revision count, not a black box.

**Sounds like you, not like ChatGPT.** Brand Voice profiles capture tone, target audience, forbidden words, signature hooks, and formatting rules — set a default and every generation and every self-critique pass measures against it.

**A real editor, not just a text box.** The `/posts/[id]/edit` studio gives you the draft plus scoped, one-click AI actions: rewrite a selection, shorten a selection, or punch up the opening hook — each a fast, cheap, single-purpose model call, never the full pipeline. Not happy with the whole draft? Regenerate it (with a confirm dialog, because there's no undo) and see the old and new side by side before you decide what to keep.

**On-demand mode when you already know what you want to say.** `/generate` skips the topic-suggestion step entirely: describe a topic, pick a brand voice, and stream back a LinkedIn post, an X thread, and a standalone hook — all in one pass, all grounded in the same knowledge base.

**Runs on Hugging Face by default, your own machine if you'd rather.** Every model call goes through one router — swap in a local Ollama model with a single env var, no code changes, no vendor lock-in.

**Every model call is logged, scored, and accountable.** Every pipeline run and every individual model call is recorded — status, latency, token counts, retries, failures — so "why did this draft come out weird" always has an answer.

**Yours and only yours.** Single-owner by design: an email allowlist gates everything behind Supabase auth, every table is scoped to one owner both in application code and via Postgres Row-Level Security, and there's no multi-tenant scaffolding anywhere to misconfigure.

## Where it stands

| Phase | What shipped |
|---|---|
| 0 — Bootstrap | Authenticated shell, CI/CD, branch protection, release automation |
| 1 — Knowledge Base | Full CRUD, categories/pillars/tags, hybrid search + reranking, bulk import |
| 2.5 — Brand Voice + On-Demand Generation | Voice profiles, streaming `/generate` (LinkedIn + X thread + hook) |
| 2 (partial) — Pipeline Core | Outline → Draft → Grill self-critique loop, full AiRun observability, opt-in local Ollama provider |
| 3 (partial) — Topics & Studio Editor | AI topic suggestions from knowledge gaps, accept-to-draft pipeline, studio editor with inline rewrite/shorten/change-hook and Regenerate |

Deferred, tracked, not forgotten: Domain Contexts, media generation (images/video), scheduling & publishing, analytics, and a handful of pipeline stages (research, humanization, CTA generation, and others) — see `docs/06-Implementation-Plan.md` for the full roadmap and every documented deviation from the original spec.

## Prerequisites

- Node.js 22+
- Docker Desktop (local dev stack)
- For production: a Supabase project (free tier is sufficient), and a GitHub OAuth App / Google OAuth Client for social login

## Local Setup

Local dev runs entirely in Docker via a hand-maintained `docker/docker-compose.yml`
(Postgres+pgvector, GoTrue, PostgREST, Realtime, Storage, Kong, Studio, Mailpit,
edge-runtime) — fixed ports, no `supabase` CLI dependency. Production still uses
a hosted Supabase project (see "Production Setup" below); this section is local-only.

### 1. Start the local stack

```bash
cp docker/.env.example docker/.env   # fill in ANON_KEY/SERVICE_ROLE_KEY/SECRET_KEY_BASE — see comments in the file
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d
```

Fixed ports (match `docker/.env` — do not change without updating `.env` too):

| Service | Port | Purpose |
|---|---|---|
| Kong (API gateway) | `54321` | `NEXT_PUBLIC_SUPABASE_URL` — all REST/Auth/Storage/Realtime traffic |
| Postgres | `54322` | `DATABASE_URL` / `DIRECT_URL` |
| Studio | `54323` | DB/table browser UI |
| Mailpit | `54324` | view magic-link emails sent by local Auth |
| GoTrue / PostgREST / Realtime / Storage / postgres-meta / edge-runtime | `9999` / `3001` / `4000` / `5001` / `8080` / `8081` | direct debug access (the app talks to these through Kong, not directly) |

pgvector is enabled by default in the `supabase/postgres` image used for `db`.

### 2. Configure Auth providers (optional, for GitHub/Google login)

GoTrue's declarative config for local dev only enables Email (magic link) by
default. To add GitHub/Google, add `GOTRUE_EXTERNAL_GITHUB_*` /
`GOTRUE_EXTERNAL_GOOGLE_*` env vars to the `auth` service in
`docker/docker-compose.yml` (see the commented-out block in Supabase's
[official self-hosting compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
for the exact variable names), using OAuth app callback URL
`http://localhost:54321/auth/v1/callback`.

### 3. Set environment variables

```bash
cp .env.example .env
```

`docker/.env`'s `ANON_KEY`/`SERVICE_ROLE_KEY` go into the app's `.env` as
`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`; `NEXT_PUBLIC_SUPABASE_URL`
is `http://127.0.0.1:54321`; `DATABASE_URL`/`DIRECT_URL` both point at
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` (no pooler locally).
`OWNER_EMAILS` is a comma-separated list of the email address(es) allowed past
`/login` — any other authenticated address is redirected to `/forbidden`.
`HUGGINGFACE_API_TOKEN` powers embeddings, reranking, and generation by
default; set `MODEL_PROVIDER=ollama` (plus `OLLAMA_BASE_URL`/`OLLAMA_MODEL` if
you're not using the defaults) to route generation to a local Ollama instance
instead — see `docs/local-ollama-setup.md`.

### 4. Install dependencies and run migrations

```bash
npm install
npx prisma migrate deploy
```

Applies every migration in `prisma/migrations/` (users/settings, knowledge
base, brand voice, pipeline core, topics/posts) against `DIRECT_URL`.

### 5. Run the dev server

```bash
npm run dev
```

Visit http://localhost:3000 — unauthenticated requests redirect to
`/login`. Signing in with an `OWNER_EMAILS` address lands on `/dashboard`,
with `Generate`, `Knowledge`, `Topics`, and `Posts` in the nav; any other
address is redirected to `/forbidden`.

## Production Setup

Deployment target is Vercel + a hosted Supabase project (not the local Docker
stack above).

1. Create a project at the [Supabase dashboard](https://supabase.com/dashboard); note the project URL and `anon`/`service_role` keys (Project Settings → API), and the pooled ("Transaction" mode) + direct ("Session" mode) connection strings (Project Settings → Database) — these become `DATABASE_URL` and `DIRECT_URL`.
2. Database → Extensions → enable `vector` (`pgcrypto` is on by default).
3. Authentication → Providers: enable Email, and GitHub/Google if using social login (GitHub OAuth App at https://github.com/settings/developers, Google OAuth Client in Google Cloud Console — callback URL `https://<project-ref>.supabase.co/auth/v1/callback` for both).
4. Authentication → URL Configuration: Site URL and Redirect URLs matching the Vercel deployment URL (`https://<app>.vercel.app/auth/callback`).
5. In Vercel: import the repo, set the same env vars as `.env` (pointing at the hosted project's values) plus `OWNER_EMAILS`, then deploy.
6. Run `npx prisma migrate deploy` against the production `DIRECT_URL` once, to apply every migration to the hosted database.

**OAuth, the hosted Supabase project, and Vercel deployment are deferred** —
tracked, not blocking (see `docs/06-Implementation-Plan.md` Phase 0
amendment). Local dev against the Docker stack above is fully functional in
the meantime.

## CI/CD & Branching

- **Branch protection on `main`:** no direct pushes, PRs required. The `CI`
  workflow's `lint-typecheck`, `test`, `e2e`, and `security-scan` jobs must
  pass, and the branch must be up to date with `main`, before a PR can merge.
  Force-pushes to `main` are disallowed. Configured under GitHub → Settings →
  Branches → Branch protection rules.
- **CI** (`.github/workflows/ci.yml`): runs on every PR and push to `main` —
  lint + typecheck, unit + integration tests (against a `pgvector/pgvector:pg16`
  Postgres service container, independent of the local Docker stack), a
  Playwright E2E smoke test, an `npm audit`/Trivy security scan, and (on PRs)
  a dependency review.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`,
  `docs:`, `chore:`, `ci:`), enforced locally by commitlint via a
  `simple-git-hooks` `commit-msg` hook — installed automatically by
  `npm install`'s `postinstall` script. No AI attribution in commit messages.
- **Releases:** [release-please](https://github.com/googleapis/release-please-action)
  (`.github/workflows/release.yml`) watches `main` and keeps a standing
  "Release PR" up to date with a version bump and changelog generated from
  Conventional Commit messages since the last release. To cut a release,
  merge that PR — it creates the `vX.Y.Z` tag and GitHub Release
  automatically. No manual changelog or version editing.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npx prisma studio` | Browse the database |
| `npx prisma migrate dev` | Create/apply a migration locally |
| `npm run test:unit` | Vitest — unit tests (`tests/unit`) |
| `npm run test:integration` | Vitest — integration tests against Postgres (`tests/integration`) |
| `npm run test:e2e` | Playwright — E2E tests (`tests/e2e`) |
