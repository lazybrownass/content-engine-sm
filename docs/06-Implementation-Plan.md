## Implementation Plan — LinkedIn Content Engine

Version 1.0 · Phased build order, folder structure, standards, CI/CD, testing

---

### 1. Folder Structure

```
.
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── forbidden/page.tsx
│   ├── (app)/                        # authenticated shell, layout enforces owner check
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── knowledge/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── topics/
│   │   │   ├── page.tsx
│   │   │   └── generate/page.tsx
│   │   ├── posts/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── edit/page.tsx
│   │   ├── schedule/page.tsx
│   │   ├── analytics/page.tsx
│   │   └── settings/
│   │       ├── business-context/page.tsx
│   │       ├── style-memory/page.tsx
│   │       ├── models/page.tsx
│   │       └── publishing/page.tsx
│   ├── api/
│   │   ├── pipeline-runs/[id]/
│   │   │   ├── status/route.ts
│   │   │   └── tick/route.ts
│   │   ├── webhooks/
│   │   │   ├── n8n/route.ts
│   │   │   ├── make/route.ts
│   │   │   └── playwright/route.ts
│   │   └── cron/
│   │       ├── dispatch-publishing/route.ts
│   │       └── refresh-style-memory/route.ts
│   ├── layout.tsx
│   └── globals.css
│
├── features/                          # feature-based organization (see §5)
│   ├── knowledge/
│   │   ├── components/
│   │   ├── actions.ts                # Server Actions
│   │   ├── queries.ts                # read-only data access
│   │   └── schema.ts                 # Zod schemas
│   ├── domain-context/
│   │   ├── components/
│   │   ├── actions.ts
│   │   └── schema.ts
│   ├── topics/
│   ├── posts/
│   ├── pipeline/
│   │   ├── stages/                   # one file per pipeline stage
│   │   │   ├── knowledge-retrieval.ts
│   │   │   ├── business-context-merge.ts
│   │   │   ├── ...
│   │   │   └── cta-generation.ts
│   │   ├── orchestrator.ts
│   │   └── types.ts
│   ├── media/
│   │   ├── providers/
│   │   │   ├── gemini-imagen.provider.ts
│   │   │   ├── higgsfield.provider.ts
│   │   │   └── media-provider.interface.ts
│   │   └── actions.ts
│   ├── publishing/
│   │   ├── providers/
│   │   │   ├── n8n.provider.ts
│   │   │   ├── make.provider.ts
│   │   │   ├── playwright.provider.ts
│   │   │   ├── manual.provider.ts
│   │   │   └── provider.interface.ts
│   │   └── actions.ts
│   ├── analytics/
│   ├── style-memory/
│   └── settings/
│
├── lib/
│   ├── ai/
│   │   ├── model-router.ts           # single entry point for all model calls
│   │   ├── providers/
│   │   │   ├── huggingface.ts
│   │   │   └── secondary.ts
│   │   ├── embeddings.ts
│   │   └── rerank.ts
│   ├── db/
│   │   └── prisma.ts
│   ├── auth/
│   │   └── session.ts
│   ├── validation/                   # shared Zod schemas
│   └── utils/
│
├── components/
│   ├── ui/                           # shadcn/ui primitives (owned copies)
│   └── shared/                       # cross-feature composed components
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── a11y/
│
├── ai/
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   └── MASTER_PROMPT.md
│
├── docs/                             # this documentation set
├── .github/workflows/
├── middleware.ts
├── next.config.ts
└── package.json
```

**Naming conventions:** files `kebab-case`, React components `PascalCase` exported from a `kebab-case.tsx` file matching the component name, Server Actions suffixed `actions.ts` per feature, Zod schemas suffixed `schema.ts`, one pipeline stage per file under `features/pipeline/stages/` named identically to its `PipelineStage` enum value (lowercased, kebab-case) so the orchestrator can resolve a stage module by convention rather than a manual switch statement.

### 2. Why Feature-Based Organization

Rejected alternative: strict MVC-style folders (`controllers/`, `models/`, `views/`). Feature folders (`features/posts/*`) keep everything needed to understand "how posts work" in one place, which matters more for a solo-maintained, AI-agent-edited codebase than following a framework convention — when Claude Code is asked to "add a field to posts," the blast radius is one folder, not four.

`lib/` holds genuinely cross-feature infrastructure (the model router, the Prisma client singleton, auth helpers) — nothing feature-specific belongs there.

### 3. Coding Standards

- **TypeScript strict mode**, `noUncheckedIndexedAccess: true`, no `any` without an inline comment justifying it (and preferring `unknown` + narrowing instead).
- **ESLint** (`next/core-web-vitals` + `@typescript-eslint/recommended-requiring-type-checking`) and **Prettier** run on every commit via a pre-commit hook (`simple-git-hooks` or `husky` — prefer `simple-git-hooks`, zero extra runtime dependency).
- **Import ordering:** enforced via `eslint-plugin-import` — node builtins → external packages → internal `@/lib`, `@/features`, `@/components` aliases → relative imports, blank line between groups.
- **Error handling:** Server Actions never throw raw errors to the client; they return a discriminated union `{ success: true, data } | { success: false, error: { code, message } }` so the UI can render specific, non-generic error states (per 03-App-Flow.md §11). Unexpected exceptions are caught at the action boundary, logged, and converted to a generic `INTERNAL_ERROR` code — the raw stack trace never reaches the client.
- **Logging:** structured JSON logs (`pino` — lightweight, fast, works in Next.js server contexts) for all Server Actions, Route Handlers, and pipeline stage executions; every log line includes `ownerId`, and where applicable `postId`/`pipelineRunId`/`stage`, so any issue is traceable end-to-end.
- **Comments:** explain *why*, not *what* — code should be legible without comments describing control flow; comments are reserved for non-obvious tradeoffs (e.g., why a specific model was chosen inline where it deviates from the TRD default, why a raw SQL query bypasses Prisma).
- **Architecture rules (SOLID applied pragmatically, not dogmatically):**
  - Single Responsibility: one pipeline stage = one file = one job.
  - Open/Closed: the `PublishingProvider` and `ModelRouter` interfaces exist specifically so new providers/models are additive, not modifications to existing code.
  - Dependency Inversion: feature code depends on the `provider.interface.ts` contract, never on a concrete provider (`n8n.provider.ts`) directly — the orchestrator resolves the concrete implementation from `automation_providers` config at runtime.
  - No dogmatic layering for its own sake — a single-owner internal tool does not need a repository-pattern abstraction over Prisma; Prisma itself is the data-access abstraction. Avoid adding indirection that doesn't pay for itself.

### 4. Phased Build Plan

Each phase is small enough to ship and verify independently. Commit after every completed task within a phase (Conventional Commits, see §7); do not batch unrelated changes into one commit.

#### Phase 0 — Project Bootstrap

**Objectives:** working Next.js 16 project, connected to Supabase, with auth gating in place before any feature work starts.

**Amendment (owner decision, recorded here per `ai/AGENTS.md` §10 rather than left implicit):** hosted deployment and OAuth (GitHub/Google) are explicitly deferred. Development proceeds against local Supabase (Docker Compose, not the Supabase CLI, to avoid a CLI version dependency) with email/magic-link auth only, until the owner chooses to deploy. This is not a blocker being worked around — it is a deliberate sequencing choice, so Phase 0's Definition of Done is amended below rather than treated as unmet. What is **not** deferred is CI/CD: the automated lint/typecheck/test/build gate and branch protection must be in place before Phase 1 feature work starts, because that gate is what makes "merged to `main`" mean something once an AI agent is committing regularly.

| Task | Deliverable |
|---|---|
| Initialize Next.js 16 (App Router, TS, Tailwind v4, ESLint) via `create-next-app` | Repo scaffold |
| Add shadcn/ui, configure `components.json`, install base primitives (Button, Input, Card, Dialog, Toast/Sonner, Command) | `components/ui/*` |
| Local Supabase via `docker/docker-compose.yml` (fixed ports), `pgvector` enabled, Email/magic-link auth working | Documented in `README.md` under "Local Setup" |
| Add Prisma, write initial `schema.prisma` (Users + Settings only), run first migration | `prisma/migrations/0001_init` |
| Implement middleware: session check + owner allow-list redirect | `middleware.ts` |
| GitHub repo with branch protection on `main`, CI workflow (`.github/workflows/ci.yml` per §5) required to pass before merge | Protected `main`, green CI on the first PR |
| Release process wired (Conventional Commits → automated versioning/changelog) | `.github/workflows/release.yml`, first `v0.0.x` tag |
| *(Deferred — tracked, not blocking)* GitHub/Google OAuth app credentials, hosted Supabase project, Vercel deployment | Documented as a "Production Setup" section in `README.md`, executed when the owner is ready |

**Acceptance criteria:** email/magic-link login succeeds locally, non-owner emails are redirected to `/forbidden`, owner reaches an empty `/dashboard`; a PR cannot merge to `main` without CI passing; a merge to `main` produces a version bump/changelog entry.
**Testing:** manual auth flow smoke test against the local stack; one Playwright E2E test covering login → dashboard → logout, run in CI against the Postgres service container (independent of the local Docker Compose stack).
**Risks:** local-only auth for an extended period risks OAuth wiring being deferred indefinitely — mitigate by keeping the "Production Setup" README section current and treating it as a named, tracked task, not a someday-maybe.
**Definition of Done (amended):** local dev stack fully functional end-to-end, CI/CD gate and branch protection enforced on `main`, release automation producing tagged versions from Conventional Commits. Hosted deployment and OAuth remain explicitly open, tracked separately, and do not block Phase 1.

#### Phase 1 — Knowledge Base

**Objectives:** full knowledge CRUD + embeddings + search, since every downstream feature depends on it.

| Task | Deliverable |
|---|---|
| Full `schema.prisma` for knowledge tables + migration incl. pgvector index, FTS index | `prisma/migrations/0002_knowledge` |
| `features/knowledge/schema.ts` Zod schemas per category | Validation layer |
| Knowledge list/detail/new pages (Server Components) + Server Actions (create/update/archive) | `/knowledge/*` |
| `lib/ai/embeddings.ts` — embedding generation via HF Inference Providers (BAAI/bge-base-en-v1.5), async on create/update | Embedding pipeline |
| Hybrid search (`lib/knowledge/search.ts`): keyword FTS + vector similarity + cross-encoder rerank | Search function + `/knowledge?q=` UI |
| Bulk import (paste/markdown/CSV) with per-row validation and partial success | Import UI + action |

**Embedding pipeline mechanism (implementation note):** `lib/knowledge/chunking.ts` splits a saved item's body into chunks (greedy paragraph-packing to a char budget, sentence-boundary fallback for oversized paragraphs); `lib/knowledge/embedding-pipeline.ts` writes them as `KnowledgeChunk` rows (`embeddingStatus = 'pending'`) and exposes `processPendingKnowledgeChunks()`, a global FIFO processor over that status column — no separate queue table. `createKnowledgeItem`/`updateKnowledgeItem`/`bulkImportKnowledgeItems` chunk synchronously, then schedule embedding via Next's `after()` (runs after the response is sent, bounded by the route's `maxDuration`) so a single item is searchable within seconds without blocking the mutation. Since `after()` isn't a durable job, a bulk import large enough to exceed `maxDuration` could strand chunks as `pending`; `app/api/cron/process-embeddings` (Vercel Cron, every minute — same "tick a queue" pattern used for `pipeline_runs`/`publishing_jobs` in later phases) drains anything left over.

**Acceptance criteria:** creating a knowledge item makes it findable via both keyword and semantic search within a few seconds; a malformed bulk-import row does not block the valid rows in the same batch.
**Testing:** unit tests for Zod schemas and chunking logic; integration test hitting a real (or mocked) embedding call and asserting a similarity search returns the expected item.
**Risks:** embedding provider rate limits during bulk import — mitigate with a queued, throttled embedding job rather than firing N parallel calls.
**Definition of Done:** owner can backfill 40+ real knowledge items (PRD success metric) through this UI.

#### Phase 2 — AI Pipeline Core

**Objectives:** the 12-stage generation pipeline running end-to-end for a single manually-seeded topic, with full observability.

| Task | Deliverable |
|---|---|
| Extend `schema.prisma`: `DomainContext`, `GeneratedMedia`, `Post.qualityScore`/`grillCycles`/`domainContextId`, `Topic.domainContextId`, `Settings.minQualityScore`, `PostStatus` additions (`DRAFT`, `GRILLING`) | `prisma/migrations/000X_domain_media_grill` |
| `lib/ai/model-router.ts` + HF provider adapter + secondary fallback provider | Model routing layer |
| `prompt_templates` seed data for all 12 stages | `prisma/seed.ts` |
| One module per stage under `features/pipeline/stages/*`, each with typed input/output per 02-TRD.md §4 | Stage implementations |
| `quality-review.ts` implements the Grill self-critique loop: score the draft 0–100 against the banned-pattern list + `DomainContext` tone/vocabulary match, write `Post.qualityScore`; below `Settings.minQualityScore` triggers exactly one bounded revision cycle back through Writing/Humanization (`Post.grillCycles` tracks the attempt), then always advances regardless of final score | `features/pipeline/stages/quality-review.ts` |
| `pipeline_runs` + `ai_runs` tables, orchestrator that advances one stage per `tick` and sets `Post.status = GRILLING` while the Quality Review loop is active | `features/pipeline/orchestrator.ts`, `/api/pipeline-runs/[id]/tick` |
| Vercel Cron wired to tick in-progress runs every minute | `vercel.json` cron config |
| Pipeline Stage Viewer component (04-UI-UX-Design-Brief.md §8) | `/posts/[id]` stage UI |
| Retry/backoff + fallback provider wiring per 02-TRD.md §5.6 | Resilience logic |

**Acceptance criteria:** a manually created `Topic` row, when accepted, produces a fully drafted, humanized, grammar-checked post with a CTA — without manual intervention — and every stage's output is inspectable in the UI. A draft scoring below `minQualityScore` triggers exactly one bounded revision cycle, never an unbounded loop, and the post always reaches `NEEDS_OWNER_REVIEW` with `qualityScore` visible regardless of outcome.
**Testing:** integration test per stage (given a fixed input, mock the model call, assert output shape); one full end-to-end pipeline test with all model calls mocked to deterministic fixtures (real model output is non-deterministic and unsuitable for CI assertions — see §6); a dedicated test asserting the Grill loop stops after its bounded cycle count even when the mocked score never clears the threshold.
**Risks:** a stage silently producing malformed structured output (LLMs are not perfectly reliable at strict JSON) — mitigate with Zod validation on every stage output and automatic single retry with a stricter "return valid JSON only" instruction on validation failure.
**Definition of Done:** pipeline runs are resumable after a server restart (state lives in Postgres, not memory) and every failure mode surfaces a specific, actionable error in the UI.

#### Phase 2.5 — Brand Voice & On-Demand Generation (documented out-of-order insertion)

**Objectives:** a scoped, one-shot alternative to the full pipeline for quick on-demand content generation, built ahead of Phase 2's orchestrator being complete. Explicitly out of sequence — recorded here per AGENTS.md §10.1 so this deviation doesn't silently drift from the plan, rather than left undocumented.

| Task | Deliverable |
|---|---|
| `BrandVoice` model: manually-authored tone/forbiddenWords/signatureHooks/formattingRules, owner-scoped, RLS in the same migration | `prisma/migrations/*_add_brand_voice_schema` |
| Minimal `lib/ai/model-router.ts` (single `getModel(purpose)` export, one purpose key today) as the sanctioned AGENTS.md Rule 4 model-SDK boundary, ahead of Phase 2's full per-stage/`prompt_templates` routing, which will extend rather than replace it | `lib/ai/model-router.ts` |
| `features/brand-voice/{schema,actions,queries}.ts` CRUD, mirroring `features/knowledge/*`'s conventions | Brand Voice CRUD |
| `features/generation/{schema,prompt}.ts` — prompt synthesis consuming `searchKnowledgeItems` (Phase 1) RAG results + a selected `BrandVoice`, with explicit forbidden-word/tone constraints and an anti-fabrication guard | Prompt synthesis engine |
| `app/api/generate/route.ts` — streaming `streamObject` endpoint. A narrow, explicitly-flagged exception to AGENTS.md Rule 2 (Route Handlers are normally reserved for webhooks/cron/pipeline-tick): `@ai-sdk/react`'s `useObject` hook requires a fetch-consumable streaming `Response`, which a Server Action cannot produce | On-demand generation endpoint |
| `/generate` page: Brand Voice selector, RAG context preview, streamed LinkedIn/X-thread/hook output with copy buttons | `app/(app)/generate/page.tsx` |

**Acceptance criteria:** the owner can select a `BrandVoice`, enter a topic, and get a streamed LinkedIn post, X thread, and hook grounded in the knowledge base, honoring that voice's forbidden words and tone. No pipeline/orchestrator/PromptTemplate machinery required — this path is independent of Phase 2's stage pipeline.
**Testing:** unit tests for schema/prompt-building; integration tests for BrandVoice CRUD (including the AGENTS.md §9.5 cross-owner RLS check) and the generation route with a mocked model; E2E happy path with the model mocked behind an `E2E_MOCK_LLM` flag (§9.3 — never assert on real model output in CI).
**Risks:** `@ai-sdk/huggingface`'s Inference-Providers routing doesn't guarantee native JSON-schema/tool-calling support per model — mitigated with `experimental_repairText` plus soft (`.describe()`, not hard `.max()`) length constraints on model-authored fields, and an explicit failure surfaced to the UI if recovery still fails.
**Definition of Done:** same bar as other phases (§14) — lint/typecheck/tests pass, RLS present, docs (this section) match the shipped implementation.

#### Phase 2 (continued) — Pipeline Core Foundation (partial, out-of-order continuation)

**Objectives:** a standalone orchestrator running outline → draft → grill_review sequentially with full execution/token/latency observability, built ahead of the remaining 9 documented stages and their Post/DomainContext/tick/UI machinery. Explicitly out of sequence — recorded here per AGENTS.md §10.1.

| Task | Deliverable |
|---|---|
| `PipelineRun`/`AiRun` schema (direct `ownerId`, 3-value `PipelineStage`), RLS in the same migration | `prisma/migrations/*_add_pipeline_core_schema` |
| `lib/ai/model-router.ts` extended with `outline`/`draft`/`grill_review` purposes, backward compatible | `lib/ai/model-router.ts` |
| Outline/draft/quality-review stage modules, one file each | `features/pipeline/stages/*.ts` |
| Orchestrator sequencing stages, persisting `PipelineRun`/`AiRun`, one bounded Grill revision cycle | `features/pipeline/orchestrator.ts` |
| Zod-validate-with-one-retry-then-fail on every stage call | `features/pipeline/run-stage.ts` |

**Acceptance criteria:** given `ownerId`, `topic`, resolved `brandVoice`, and `knowledgeChunks`, `runPipeline()` executes outline → draft → grill_review, persists one `PipelineRun` row and one `AiRun` row per model call, triggers exactly one bounded revision cycle on a failing Grill score, and always reaches `COMPLETED` (or `FAILED` only for a genuine schema-validation exhaustion) regardless of final score. Standalone — not wired into `/generate` or `/api/generate`, which are untouched.
**Testing:** unit tests for schema/prompt-building; integration tests for the orchestrator (happy path, one bounded revision, two-fail-still-terminates, malformed-JSON retry-then-fail/retry-then-succeed) with all model calls mocked via `MockLanguageModelV2`/`generateObject`; a cross-owner scoping test covering both `PipelineRun` and the `AiRun` join.
**Risks:** the 3-value `PipelineStage` enum needs an additive migration when the remaining 9 stages are built — mitigated by reusing the same enum type/name as the full documented design, so extension is `ALTER TYPE ADD VALUE`, not a rename or data migration. Hardcoded `minQualityScore` needs to move to `Settings.minQualityScore` once that field exists.
**Definition of Done:** same bar as other phases (§14) — lint/typecheck/tests pass, RLS present in the same migration, docs (this section + `docs/05-Backend-Schema.md`'s deviation note) match the shipped implementation.
**Remaining for full Phase 2:** `KNOWLEDGE_RETRIEVAL`, `BUSINESS_CONTEXT_MERGE`, `TARGET_AUDIENCE_FRAMING`, `PAIN_POINT_MAPPING`, `CONTENT_OPPORTUNITY_SCORING`, `RESEARCH`, `HUMANIZATION`, `GRAMMAR`, `CTA_GENERATION` stages; `DomainContext`/`GeneratedMedia`/`Post`/`Topic`/`PromptTemplate` schema; `Settings.minQualityScore`; `PipelineRun.postId`/`purpose` reconciliation; `/api/pipeline-runs/[id]/tick` cron endpoint; Pipeline Stage Viewer UI; wiring the orchestrator into any real route/UI.

#### Phase 3 — Topic Generation + Editor

**Objectives:** close the loop from knowledge → topic suggestion → owner decision → editor.

| Task | Deliverable |
|---|---|
| `features/domain-context/` CRUD (create/edit/archive Domain Contexts: category, label, vocabulary/tone/compliance notes, default flag) | `/settings/domain-context` |
| Topic generation flow (`/topics/generate`) invoking Knowledge Retrieval → Content Opportunity Scoring as a `pipeline_run` with `purpose = topic_generation`, reading the selected/default `DomainContext` to bias vocabulary and angle | Topic suggestion UI |
| Accept/reject/edit topic actions, 90-day suppression on reject | `features/topics/actions.ts` |
| Rich-text editor (client island) with inline AI actions (rewrite selection, shorten, change hook) as scoped model calls | `/posts/[id]/edit` |
| `features/media/` — opt-in media generation button on a post: `MediaProvider` interface + `gemini-imagen.provider.ts` (images/diagrams, ~$0.03/generation) + `higgsfield.provider.ts` (short video clips, ~$0.13/generation); cost shown and explicitly confirmed before any call, cost written to `GeneratedMedia.costUsd` | `/posts/[id]/edit` media panel |
| Repeated-phrase check against `recent_post_phrases` materialized view | Editor warning banner |
| Approve / approve-with-edit-diff / reject flow, writing to `feedback` | Approval gate |

**Acceptance criteria:** owner can go from "click Generate" to an approved, edited post in under 10 minutes of active time (PRD success metric), with every intermediate decision (accept topic, edit outline, approve) explicit and visible. A post generated under a given `DomainContext` visibly reflects that domain's vocabulary/tone. No media generation call fires without an explicit owner click and a visible cost shown first.
**Testing:** E2E test covering the full happy path; unit tests for repeated-phrase similarity scoring; integration test mocking both media providers (success and failure) and asserting `GeneratedMedia.costUsd`/`status` are recorded correctly.
**Risks:** inline AI actions feel slow if each round-trips the full model stack — mitigate by routing inline actions to the fast Qwen3-8B tier, not the heavier Writing-stage model.
**Definition of Done:** a real topic, generated from real knowledge, becomes a real approved post through this UI.

#### Phase 4 — Scheduling + Publishing Adapters

**Objectives:** provider-agnostic publishing, starting with Manual (guaranteed to work) and one automation provider.

| Task | Deliverable |
|---|---|
| `Schedule` + `PublishingJob` + `AutomationProvider` CRUD | `/schedule`, `/settings/publishing` |
| `PublishingProvider` interface + `manual.provider.ts` | Manual provider (always available) |
| `n8n.provider.ts` — HMAC-SHA256 signed webhook dispatch (`AutomationProvider.signingSecretRef`) + signature-verified callback receiver (`app/api/webhooks/n8n/route.ts`, constant-time compare, 401 on invalid/missing signature) | n8n integration |
| `make.provider.ts` — same HMAC-SHA256 dispatch/verification pattern as `n8n.provider.ts` | Make integration |
| Cron job dispatching due `publishing_jobs` | `/api/cron/dispatch-publishing` |
| `publish_unconfirmed` timeout handling + owner confirmation UI | Recovery flow per 03-App-Flow.md §8 |

**Acceptance criteria:** scheduling a post with the Manual provider produces a correctly timed reminder and a working copy-to-clipboard flow with zero external dependencies; the n8n provider successfully round-trips a real test payload with a valid signature; a callback with a missing or invalid signature is rejected with 401 and never transitions a `PublishingJob`.
**Testing:** integration tests mocking webhook responses (success, timeout, non-2xx, invalid signature); manual verification of one real n8n publish before considering this phase done.
**Risks:** webhook callback never arrives (network/config issue on the n8n side) — mitigated by the `publish_unconfirmed` state, never a false `published`.
**Definition of Done:** owner has published at least one real post through this system end-to-end.

#### Phase 5 — Analytics + Learning Loop

**Objectives:** close the feedback loop so the system measurably improves.

| Task | Deliverable |
|---|---|
| Manual analytics entry form + `AnalyticsSnapshot` writes | `/analytics` entry UI |
| `post_performance_rollup` view + dashboard charts (Recharts) | Analytics dashboards |
| Style memory computation job (sentence length, emoji rate, hook/CTA pattern frequency, repeated phrase index) | `/api/cron/refresh-style-memory` |
| Topic scoring weight adjustment based on historical pillar/hook performance | Scoring heuristic update in Content Opportunity Scoring stage |
| Playwright analytics adapter (optional, documented as enhancement not launch blocker per PRD §15) | `playwright.provider.ts` analytics mode |

**Acceptance criteria:** style memory profile visibly updates after 5+ published posts with entered metrics; topic scoring measurably favors historically higher-performing pillars/hooks.
**Testing:** unit tests for the style computation aggregation logic against fixture post data.
**Risks:** too little data early on makes the learning loop noisy — mitigate by requiring a minimum sample size (documented threshold, e.g. 10 posts) before scoring weights deviate meaningfully from baseline.
**Definition of Done:** the learning loop is demonstrably influencing new topic suggestions, not just displaying historical charts.

#### Phase 6 — Hardening

**Objectives:** security review, accessibility audit, performance pass, polish before calling v1 "done."

| Task | Deliverable |
|---|---|
| Full accessibility pass against 04-UI-UX-Design-Brief.md §10 | Axe/Playwright a11y test suite green |
| Lighthouse audit on all primary routes, fix regressions to hit ≥95 | Performance report |
| Security review: RLS policy audit, secret handling audit, CSP header verification | Security checklist signed off |
| Data export (knowledge base + posts as JSON/Markdown) | `/settings` export action |
| Documentation pass: README, `.env.example`, runbook for common failures (pipeline stuck, publishing failed) | `README.md`, `RUNBOOK.md` |

**Acceptance criteria:** all NFRs in 01-PRD.md §10 are met and verifiable.
**Definition of Done:** v1 ships.

### 5. CI/CD

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres" }
      - run: npm run test:unit
      - run: npm run test:integration
        env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres" }

  e2e:
    runs-on: ubuntu-latest
    needs: [lint-typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      - uses: aquasecurity/trivy-action@master
        with: { scan-type: fs, severity: HIGH,CRITICAL }

  dependency-review:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
```

Deployment itself is handled by Vercel's native GitHub integration (preview deployment per PR, production deployment on merge to `main`) — no separate deploy job is needed in GitHub Actions; CI's job is to gate the merge, not to ship the artifact.

A separate scheduled workflow (`.github/workflows/dependency-updates.yml`) runs Dependabot (or Renovate) weekly for dependency version PRs, reviewed manually before merge given the solo-maintainer context.

### 6. Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure functions: Zod schemas, style-memory aggregation math, repeated-phrase similarity scoring, prompt template variable interpolation |
| Integration | Vitest + a real Postgres test instance (pgvector image, per CI config above) | Server Actions against the database, hybrid search correctness, RLS policy behavior (verify a non-owner query returns zero rows) |
| E2E | Playwright | Full user journeys from 03-App-Flow.md: auth, knowledge CRUD, topic generation → approval → schedule, publishing provider dispatch (mocked webhook target) |
| Accessibility | `@axe-core/playwright` integrated into the E2E suite | Every primary route asserted against WCAG AA violations |
| Performance | Lighthouse CI (`@lhci/cli`) in a separate, non-blocking workflow reporting on PRs | Regression visibility on Lighthouse score, not a hard CI gate (avoids flaky failures blocking merges) |
| AI output validation | Structural, not semantic — assert every stage's raw model output parses against its Zod contract; semantic quality is evaluated by the Quality Review stage itself and by owner feedback, not by CI | Every stage module has a test with a mocked model response validating the parsing/error-handling path, including a malformed-JSON case |
| Regression | E2E suite re-run on every PR to `main`; no separate regression suite given the small surface area | — |
| Load | Explicitly out of scope for v1 — single-user tool, load testing effort is disproportionate to risk (documented decision, revisit only if usage pattern changes) | — |

Model calls are always mocked in CI — real inference is non-deterministic, would make tests flaky, and would consume free-tier quota on every CI run. A small, separate manual/local-only script (`scripts/pipeline-smoke-test.ts`) exists for periodically verifying real model integration still works, run on demand, not in CI.

### 7. Git Workflow & Commit Discipline

- **Branch strategy:** trunk-based with short-lived feature branches (`feat/knowledge-search`, `fix/publishing-timeout`), merged to `main` via PR even when working solo with an AI agent — this preserves a reviewable diff history and (once deployment is turned on) Vercel preview deployments per branch.
- **Branch protection on `main`:** no direct pushes; PRs required; the CI workflow (§5: lint-typecheck, test, e2e, security-scan) must pass before merge is allowed; branch must be up to date with `main` before merging. This is configured in GitHub repo settings (Settings → Branches → Branch protection rules), not just documented convention — an AI agent committing regularly needs a hard gate, not an honor system.
- **Conventional Commits**, enforced by commitlint in a pre-commit/pre-push hook: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`. Scope where useful: `feat(pipeline): add quality review retry logic`.
- **Commit after every completed task**, not after every file save — a commit should represent one coherent, working change.
- **No AI attribution of any kind** in commit messages: no `Co-authored-by: Claude`, no "Generated with Claude Code," no contributor metadata referencing the AI agent. Commits read exactly as if written by the human owner.
- **Automatic push** after a clean commit is acceptable once local lint/typecheck/unit tests pass; CI is the final gate before merge, not a replacement for local verification.

### 7.1 Release Process

Conventional Commits exist for more than readability — they drive automated versioning. This project uses **release-please** (GitHub Action, maintained by Google, native Conventional-Commits parsing) over `semantic-release` because it works as a PR-based review step (opens/updates a "Release PR" with the version bump and generated changelog, merged explicitly) rather than auto-publishing on every merge — a better fit for a solo owner who wants to see the changelog before it becomes a tagged release, and who is not publishing this to a package registry.

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: node
          target-branch: main
```

Behavior: every merge to `main` updates (or opens) a standing "Release PR" that accumulates the changelog from Conventional Commit messages since the last release. Merging that PR creates the version bump commit, a `vX.Y.Z` git tag, and a GitHub Release with generated notes. No manual changelog writing, no manual version bumping in `package.json`. Because deployment is currently deferred, a release tag for now marks "a verified, CI-green checkpoint of local functionality" rather than "a deployed version" — that meaning upgrades automatically once Vercel deployment is wired in, with no process change required.

### 8. Estimated Effort (solo developer + AI agent pairing)

| Phase | Estimate |
|---|---|
| 0 — Bootstrap | 0.5–1 day |
| 1 — Knowledge Base | 2–3 days |
| 2 — AI Pipeline Core | 5–7 days (the largest phase — 12 stage implementations + orchestration + resilience + the Grill self-critique loop and domain/media schema) |
| 3 — Topic Generation + Editor | 4–5 days (includes Domain Context CRUD and opt-in media generation) |
| 4 — Scheduling + Publishing | 2–3 days |
| 5 — Analytics + Learning Loop | 2–3 days |
| 6 — Hardening | 1–2 days |
| **Total** | **~17–24 working days** |

Estimates assume the AI agent (Claude Code) does the bulk of implementation against these documents with the owner reviewing and directing, not the owner writing every line manually.
