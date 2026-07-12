# LinkedIn Content Engine

Single-owner internal tool that turns raw knowledge (projects, case studies,
lessons learned) into LinkedIn posts through a multi-stage AI pipeline. Full
spec lives in `docs/` (PRD, TRD, App Flow, UI/UX brief, backend schema,
implementation plan) and `ai/AGENTS.md` (agent operating rules).

## Status

Phase 0 (Project Bootstrap) complete: authenticated shell only, no feature
tables yet.

## Prerequisites

- Node.js 22+
- A Supabase project (free tier is sufficient)
- A GitHub OAuth App and a Google OAuth Client, for social login

## Local Setup

### 1. Create a Supabase project

1. Create a new project at the [Supabase dashboard](https://supabase.com/dashboard).
2. Note the project URL and the `anon` / `service_role` API keys (Project Settings → API).
3. Note the pooled connection string (Project Settings → Database → Connection string → "Transaction" mode) and the direct connection string ("Session" / direct mode) — these become `DATABASE_URL` and `DIRECT_URL`.

### 2. Enable the pgvector extension

Database → Extensions → search "vector" → enable `vector`. `pgcrypto` (used
for `gen_random_uuid()`) is enabled by default on Supabase projects.

### 3. Configure Auth providers

Authentication → Providers, in the Supabase dashboard:

- **GitHub** — create an OAuth App at https://github.com/settings/developers with callback URL `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the Client ID/Secret into Supabase's GitHub provider config and enable it.
- **Google** — create an OAuth Client in Google Cloud Console (APIs & Services → Credentials) with authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the Client ID/Secret into Supabase's Google provider config and enable it.
- **Email** — enable the built-in Email provider (magic link). No extra config needed for local dev.

Then, in Authentication → URL Configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/auth/callback` (add the deployed URL's equivalent once a Vercel deployment exists).

### 4. Set environment variables

```bash
cp .env.example .env
```

Fill in the values from steps 1–3. `OWNER_EMAILS` is a comma-separated list
of the email address(es) allowed past `/login` — any other authenticated
address is redirected to `/forbidden`.

### 5. Install dependencies and run the first migration

```bash
npm install
npx prisma migrate dev --name init
```

Creates the `users` and `settings` tables (via `DIRECT_URL`).

### 6. Run the dev server

```bash
npm run dev
```

Visit http://localhost:3000 — unauthenticated requests redirect to
`/login`. Signing in with an `OWNER_EMAILS` address lands on `/dashboard`;
any other address is redirected to `/forbidden`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npx prisma studio` | Browse the database |
| `npx prisma migrate dev` | Create/apply a migration locally |
