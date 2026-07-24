# Production Deployment

Three ways to run this in production, depending on how much you want to self-host.
None of this duplicates the docs it links to — read those for the full detail.

## 1. Vercel + hosted Supabase (recommended path)

Fully documented in `README.md`'s ["Production Setup"](../README.md#production-setup)
section — Supabase project creation, enabling the `vector` extension, auth
provider config, and the Vercel import/deploy steps. Follow that section
step-by-step; nothing here repeats it.

One thing worth confirming explicitly: `next.config.ts`'s `output: "standalone"`
(added for the Docker build below) has no effect on Vercel — Vercel's build
pipeline detects and handles Next.js natively regardless of `output` mode, so
no Vercel-side change is needed to accommodate it.

Migrations on this path are **manual**: `npx prisma migrate deploy` against the
hosted project's `DIRECT_URL`, run by hand (per README step 6) whenever new
migrations ship. `docs/05-Backend-Schema.md` §9 describes an aspirational CI
step that runs `prisma migrate deploy` against production on every merge to
`main` — no such step actually exists in `.github/workflows/ci.yml` today; CI
only migrates the ephemeral test-database service container used for the
integration test suite. Treat the manual step above as the real, current
process until a production-migration CI job is actually built.

## 2. Docker / self-hosted (VPS)

`docker/docker-compose.yml` is the full local dev stack (Postgres+pgvector,
GoTrue, Kong, PostgREST, Realtime, Storage, Studio, Mailpit) extended with
three services that containerize the app itself:

- **`migrate`** — one-shot, runs `npx prisma migrate deploy` against the
  stack's own Postgres, then exits. `app` won't start until it completes
  successfully.
- **`app`** — the Next.js server (`Dockerfile`'s `runner` stage, `node
  server.js`), exposed on `3000`.
- **`cron`** — runs `scripts/cron-runner.mjs`, a small polling loop that hits
  `app`'s `/api/cron/process-embeddings` (every 60s) and
  `/api/cron/dispatch-publishing` (every 300s) — the self-hosted stand-in for
  Vercel Cron, which has no Docker-native equivalent.

Bring the whole stack up:

```bash
cp docker/.env.example docker/.env   # fill in ANON_KEY/SERVICE_ROLE_KEY/SECRET_KEY_BASE,
                                      # plus the new OWNER_EMAILS/CRON_SECRET — see comments in the file
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --wait
```

Migrations here are **automatic** — the `migrate` service runs on every `up`,
so there's no separate manual step like the Vercel path above.

### The build-arg vs runtime-env split

This is the single most common way a Next.js Docker deploy silently breaks, so
it's worth stating plainly: `NEXT_PUBLIC_*` variables are inlined into the
client-side JS bundle **at `next build` time** — they are not read from the
container's environment at runtime. `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are therefore passed into the `Dockerfile` as
build `ARG`s (wired via `docker-compose.yml`'s `build.args`, sourced from
`API_EXTERNAL_URL`/`ANON_KEY` in `docker/.env` — the **host-facing** values,
since it's the browser, not the container network, that reads them). Changing
either of those `.env` values requires a rebuild (`docker compose build app`),
not just a restart.

Everything else — `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`HUGGINGFACE_API_TOKEN`, `OWNER_EMAILS`, `CRON_SECRET` — is runtime-only,
passed via `environment:` and read fresh on container start. None of it is
baked into the image; a restart (not a rebuild) picks up changes.

### Reverse proxy / TLS

This stack exposes Kong on `54321` and the app on `3000` as plain HTTP, same
as local dev. A VPS deployment needs its own reverse proxy (nginx, Caddy,
Traefik) terminating TLS and routing a real domain to those ports — that
proxy is not part of this repo and is out of scope here; don't assume it's
handled.

## 3. Local model routing (Ollama)

Both paths above default to Hugging Face Inference for generation. To route
to a local Ollama instance instead (free, no external API dependency, but
requires a machine with the model running), see
[`docs/local-ollama-setup.md`](./local-ollama-setup.md) for the full runbook —
not repeated here. In short: install Ollama, pull the model, verify its
OpenAI-compatible endpoint, then set `MODEL_PROVIDER=ollama` in the app's
environment (`docker/.env`'s `app`/`cron` services, or Vercel's project env
vars, depending on path).
