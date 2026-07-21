## AGENTS.md — LinkedIn Content Engine

This file is the operating manual for any AI coding agent (Claude Code or otherwise) working on this repository. It is the single source of truth for how code gets written here. Where this file and general training-data conventions disagree, this file wins.

Companion documents (read before starting any non-trivial task): `docs/01-PRD.md`, `docs/02-TRD.md`, `docs/03-App-Flow.md`, `docs/04-UI-UX-Design-Brief.md`, `docs/05-Backend-Schema.md`, `docs/06-Implementation-Plan.md`.

---

### 1. Project Context (read this first)

Single-owner internal tool. One user, ever. Every "should this be configurable/multi-tenant/generalized" question resolves to **no** unless a specific document above says otherwise. Do not add abstraction for hypothetical future users — that is over-engineering for a codebase this size, and it directly violates §11.

### 2. Architecture Rules

1. Next.js 16 App Router. Server Components by default. A file gets `"use client"` only when it needs state, effects, browser APIs, or event handlers — and only that file, not its parent tree. Push the client boundary as deep (as far from the root) as possible.
2. Data mutations go through Server Actions, colocated in `features/<feature>/actions.ts`. Route Handlers (`app/api/**`) exist only for: external webhook receivers (n8n/Make/Playwright callbacks), the pipeline status/tick endpoints, and cron triggers. Never build a Route Handler as a substitute for a Server Action just because it feels more "API-like."
3. Feature-based folders (`features/<name>/`). Cross-feature infrastructure only in `lib/`. A pipeline stage is one file in `features/pipeline/stages/`. Do not merge stages "for efficiency" — the whole point of the pipeline architecture (TRD §4) is that each stage is independently retryable, inspectable, and swappable.
4. All AI model calls go through `lib/ai/model-router.ts`. Never import a provider SDK directly inside feature code. If a stage needs a different model, change its `prompt_templates` row, not the code. Exception: `lib/ai/embeddings.ts` and `lib/ai/rerank.ts` are fixed-model utilities (not swappable per-stage pipeline calls governed by `prompt_templates`) and call `lib/ai/providers/huggingface.ts` directly — that file is their equivalent single provider-SDK boundary. Feature code still never imports `lib/ai/providers/huggingface.ts` directly; it goes through `embeddings.ts`/`rerank.ts`.
5. All publishing goes through the `PublishingProvider` interface (`features/publishing/providers/provider.interface.ts`). Never call an n8n/Make webhook URL directly from anywhere except that provider's own file. Outbound dispatch must be HMAC-SHA256 signed using the target `AutomationProvider.signingSecretRef`; inbound callback receivers (`app/api/webhooks/*`) must verify that signature with a constant-time comparison before trusting the payload, rejecting an unsigned or invalid-signature request with `401` (`docs/05-Backend-Schema.md` §10).
6. Never call the official LinkedIn API for posting. This is a deliberate architectural decision (TRD §6), not an oversight — do not "fix" it.
7. All media generation goes through the `MediaProvider` interface (`features/media/providers/media-provider.interface.ts`). Never call the Gemini or Higgsfield APIs directly outside that provider's own file — same reasoning as rule 4/5, additive not modifying when a new media provider is introduced.

### 3. SSR & Rendering Rules

1. Default to Server Components. Justify every `"use client"` with a one-line comment if the reason isn't obvious from the file (e.g., `// client: needs local cursor/selection state for inline AI rewrite`).
2. Wrap any data fetch that can take >200ms in `<Suspense>` with a skeleton matched to real content dimensions (see `docs/04-UI-UX-Design-Brief.md` §7.6). No bare spinners for content-shaped regions.
3. Use `use cache` (Cache Components) only for genuinely stable reads (knowledge list between edits, prompt template listings, style memory summary). Never cache anything reflecting live pipeline or publishing job status.
4. After every mutation, call `revalidatePath`/`revalidateTag` for the exact affected route(s) only — no blanket revalidation.
5. Data layer runs on the Node.js runtime (Prisma requirement). Do not set `export const runtime = "edge"` on any route that touches Prisma.

### 4. Performance Rules

1. `next/image` for every image, `next/font` for every font (self-hosted, no external font requests).
2. No client bundle should include a charting library, rich-text editor, or command-palette implementation outside the specific component that needs it — verify with `next build`'s bundle output, not assumption.
3. Every new page must be checked against Lighthouse ≥ 95 before being considered done (`docs/01-PRD.md` §10). If a change regresses this, fix it in the same PR, not a follow-up.
4. Do not add a client-side data-fetching library (SWR, React Query, etc.) for data that a Server Component could fetch directly. The only legitimate client-side fetching in this app is pipeline-run status polling and Supabase Realtime subscriptions — both already have a designated pattern; don't introduce a second one.

### 5. UI Rules

1. Use the design tokens in `docs/04-UI-UX-Design-Brief.md` exactly — colors, spacing, radius, typography scale. Do not introduce a one-off hex value or pixel spacing not defined there; add it to the token set first if genuinely needed.
2. shadcn/ui components are copied into `components/ui/` and owned by this repo — modify them directly when needed, don't fight the primitive from outside.
3. Every empty state names the specific next action. Every error state names the specific cause. No generic "Something went wrong" or "No data" (`docs/03-App-Flow.md` §11).
4. Microcopy has no false enthusiasm and no vague hedging — see `docs/04-UI-UX-Design-Brief.md` §11. This applies to the product's own UI copy, not just AI-generated posts.
5. Never silently mark a post as published. A `published` status requires either a provider success callback or explicit owner confirmation — no exceptions, this is a correctness requirement, not a UX preference.

### 6. Accessibility Rules

1. WCAG 2.1 AA is a hard requirement, not a stretch goal. Every interactive element: keyboard reachable, visible focus state, `aria-label` if icon-only.
2. Every form: labels always visible (never placeholder-as-label), errors announced via `aria-live`, focus moved to the first error on failed submit.
3. Every new component gets an `@axe-core/playwright` assertion in its E2E coverage before merge.
4. Respect `prefers-reduced-motion` for every animation/transition added.

### 7. Database Rules

1. `prisma/schema.prisma` is the source of truth. Never hand-edit a generated migration's DDL for a change Prisma can express — only hand-edit to add what Prisma can't (pgvector index type, RLS policies, views, triggers), and only inside the migration folder Prisma generated for that change.
2. Every owner-scoped table has RLS enabled with an owner-matching policy (`docs/05-Backend-Schema.md` §5). Any new table holding owner data must get RLS in the same migration that creates it — not a follow-up.
3. Raw SQL (`$queryRaw`) is always parameterized. Never string-concatenate a value into a raw query, including values that "feel safe" like internal IDs.
4. No destructive migration (`DROP COLUMN`, `TRUNCATE`, cascading delete of owner data) without calling this out explicitly in the PR description with a `pg_dump` backup command included.
5. Background/cron code paths use the Supabase service-role key (bypasses RLS) — these paths must manually verify `owner_id` matches the expected owner before any write. Never assume RLS is protecting a service-role code path.

### 8. AI Integration & Prompt Engineering Rules

1. One job per prompt. If a stage's prompt is trying to do two things (e.g., "write the post and also grade it"), split it into two stages. This is a direct, non-negotiable consequence of `docs/02-TRD.md` §4 — the brief this project is built from explicitly forbids a single mega-prompt pipeline.
2. Every LLM-backed stage's output is validated against a Zod schema immediately on return. On validation failure: one automatic retry with an added "return valid JSON only, matching this exact shape" instruction, then fail the stage explicitly (never silently pass through malformed data).
3. The Writing stage must only assert facts present in the Research stage's fact sheet. Prompt templates enforce this explicitly ("do not state any statistic, client name, or outcome not present in the provided fact sheet"). This is the primary defense against fabricated claims in generated content.
4. The Humanization and Quality Review prompts must actively check against the banned-pattern list in `docs/02-TRD.md` §5.4 (generic openers, rule-of-three overuse, em-dash overuse, generic CTAs, hedging filler, emoji-as-bullet abuse, buzzword stacking). This list lives in `prompt_templates` data, not hardcoded — if extending it, add to the data, not a code constant.
5. Model assignment per stage follows `docs/02-TRD.md` §5.2 by default. Changing a stage's model is a `prompt_templates` row update, never a code change, and should be justified (cost, latency, or quality reason) in the commit message if done outside routine experimentation.
6. Never call a paid model provider automatically. A paid fallback is opt-in per stage, configured explicitly by the owner in Settings, and clearly cost-labeled in the UI.
7. Grammar correction uses LanguageTool (rule-based), not an LLM call — do not "simplify" this into another LLM stage; the determinism is the point (`docs/02-TRD.md` §5.5).
8. The Quality Review stage is the Grill self-critique loop: it scores every draft 0–100 against the banned-pattern list, tone/vocabulary match to the post's `DomainContext`, and structural fluff. A post cannot leave `GRILLING` status for `NEEDS_OWNER_REVIEW`-or-later while `Post.qualityScore` is unset. Below `Settings.minQualityScore` (default 85) triggers exactly one bounded revision cycle back through Writing/Humanization, tracked by `Post.grillCycles` — never an unbounded loop. Regardless of final score, the post always advances to owner review with the score visible; the loop never silently blocks a post indefinitely (`docs/01-PRD.md` FR-14).
9. `DomainContext` vocabulary/tone/compliance notes are data-driven (`domain_contexts` table), read by the Writing/Humanization prompts at runtime. Never hardcode per-niche logic (e.g. `if (category === 'HEALTH') ...`) in application code — same principle as rule 5's banned-phrase list living in data, not a code constant.

### 9. Testing Rules

1. No PR merges without: lint clean, typecheck clean, unit + integration tests passing, and (for anything touching a user-facing flow) an E2E test covering the happy path at minimum.
2. Every pipeline stage module gets a unit/integration test with a mocked model response, including a malformed-JSON response case exercising the retry-then-fail path.
3. Never assert on real model output content in CI — mock the model call. Real-model verification is a manual/local script (`scripts/pipeline-smoke-test.ts`), not a CI gate.
4. New UI components affecting a primary route get an `@axe-core/playwright` check added to the relevant E2E spec.
5. RLS changes require an integration test proving a non-owner (or unauthenticated service context without an owner check) query returns zero rows.

### 10. Documentation Rules

1. If an implementation decision deviates from what `docs/*.md` specifies, update the relevant doc in the same PR — the docs describe the actual system, not an aspirational one. Do not let them drift.
2. Every new environment variable is added to `.env.example` with a one-line comment explaining what it's for, in the same commit that introduces its usage.
3. Non-obvious tradeoffs get a comment explaining *why*, not a restatement of *what* the code does.

### 11. Things This Agent Must Never Do

- Never add multi-tenant/multi-user scaffolding, org/team models, billing, or public signup flows.
- Never call the official LinkedIn API for posting.
- Never auto-publish a post that hasn't reached `approved` status through explicit owner action.
- Never call a paid AI API without the owner having explicitly configured and cost-labeled that fallback for that specific stage.
- Never add `Co-authored-by`, "Generated with Claude Code," or any AI-attribution metadata to a commit message.
- Never introduce a new major dependency (a new UI library, a new state-management library, a new ORM, a new job queue system) without first checking whether an existing piece of the stack already covers the need — this is a small, solo-maintained codebase; every dependency is a maintenance liability, not a free win.
- Never hardcode a model name, prompt, or banned-phrase list in application code where the schema already provides a data-driven place for it (`prompt_templates`, `style_memory_profiles`).
- Never mutate an already-applied Prisma migration file. Roll forward with a new migration instead.
- Never silently swallow a pipeline stage failure — it must be visible in the UI with the specific stage and error.
- Never use `dangerouslySetInnerHTML` on unsanitized content.
- Never edit files inside `docs/` or `ai/` to "match" code that contradicts them without first flagging the contradiction — these documents are the spec; deviations are decisions, not cleanup.
- Never generate media (image or video) without an explicit, per-request owner confirmation and a visible cost estimate shown first — both Gemini Imagen 3 and Higgsfield dop-lite are paid-only providers with no free tier.
- Never accept a webhook callback payload without verifying its HMAC signature first — an unsigned or invalid-signature request is rejected, never treated as a publish confirmation.

### 12. Things This Agent Must Always Do

- Always default new components/pages to Server Components; justify every client boundary.
- Always validate Server Action and Route Handler inputs with Zod before touching the database or calling a model.
- Always enable RLS on any new owner-scoped table, in the same migration.
- Always route model calls through `lib/ai/model-router.ts` and publishing through the `PublishingProvider` interface.
- Always write structured logs (`pino`) with `ownerId` and, where applicable, `postId`/`pipelineRunId`/`stage`.
- Always commit after each completed, coherent unit of work using Conventional Commits, with no AI attribution.
- Always run lint, typecheck, and the relevant test suite locally before pushing.
- Always update the relevant `docs/*.md` file when an implementation decision changes what was documented.
- Always route media generation through the `MediaProvider` interface and log its cost to `GeneratedMedia.costUsd` the same way `AiRun.costUsd` is logged for pipeline calls.
- Always sign outbound webhook dispatches and verify inbound callback signatures with a constant-time comparison before acting on them.

### 13. Coding Philosophy

Build the smallest thing that correctly satisfies the requirement in `docs/01-PRD.md` and `docs/02-TRD.md`. This is a personal productivity tool for one person, built by a small team of one human and one AI agent — every unnecessary abstraction, configuration surface, or "just in case" generalization is pure cost with no offsetting benefit. When in doubt, prefer the boring, well-understood solution (a Postgres table over a new service, a Server Action over a new API layer, a rule-based tool like LanguageTool over another LLM call) over the more "sophisticated" one. Sophistication is justified only when the product requirement demands it — and several places in this system genuinely do (the multi-stage pipeline, the provider abstraction, the style-memory learning loop). Apply the same discipline in reverse: don't simplify away the parts of the architecture that exist specifically to solve a stated problem (AI slop, publishing vendor lock-in, lost knowledge).

### 14. Definition of Done (applies to every task, not just phase-level work)

A task is done when: it satisfies the relevant functional requirement in `docs/01-PRD.md` §9, it follows every applicable rule in this file, lint/typecheck/tests pass locally and in CI, the relevant `docs/*.md` file is updated if behavior deviated from spec, accessibility and performance rules (§4, §6) are verified for any new UI, and the change is committed with a Conventional Commit message and no AI attribution.

### 15. Review Checklist (self-review before opening a PR)

- [ ] Server Component by default — every `"use client"` justified
- [ ] Server Action inputs validated with Zod
- [ ] New owner-scoped tables have RLS + policy in the same migration
- [ ] Model calls go through `model-router.ts`; publishing goes through `PublishingProvider`
- [ ] New pipeline stage does exactly one job and validates its output against a schema
- [ ] No hardcoded secrets; new env vars documented in `.env.example`
- [ ] Empty/error/loading states follow `docs/03-App-Flow.md` §11 conventions
- [ ] Design tokens match `docs/04-UI-UX-Design-Brief.md` — no one-off styling values
- [ ] Lighthouse and axe checks pass for any new/changed primary route
- [ ] Tests added: unit for logic, integration for DB-touching Server Actions, E2E for new user-facing flows
- [ ] Commit messages are Conventional Commits, zero AI attribution
- [ ] Relevant `docs/*.md` updated if implementation deviated from spec
- [ ] Media generation (if touched) always requires explicit owner confirmation + visible cost, routed through `MediaProvider`
- [ ] Webhook dispatch (if touched) is HMAC-signed; callback receivers verify signature with constant-time comparison before acting

### 16. Git Workflow

Trunk-based development, short-lived feature branches, PRs into `main`. Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`), scoped where useful (`feat(pipeline): ...`). Commit after each completed task. Push automatically once local checks pass; CI on the PR is the merge gate. See `docs/06-Implementation-Plan.md` §7 for full detail — this section is the summary; that document is authoritative.
