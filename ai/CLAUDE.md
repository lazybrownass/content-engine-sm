## CLAUDE.md

This project follows the cross-tool [AGENTS.md](./AGENTS.md) standard for agent instructions. Read `ai/AGENTS.md` in full before doing any work in this repository — it contains the architecture rules, coding standards, SSR/performance/UI/accessibility/database rules, AI integration rules, git workflow, definition of done, and review checklist. Everything in it applies to Claude Code exactly as written. This file does not repeat any of it.

### Claude Code–specific configuration

- **Primary spec set:** `docs/01-PRD.md` through `docs/06-Implementation-Plan.md`, plus `ai/AGENTS.md` and `ai/MASTER_PROMPT.md`. Load these into context before starting a new phase of work, not just the file you're currently editing — the pipeline, schema, and UI docs cross-reference each other constantly and a change in one usually implies a change in another.
- **Long-running work:** use `ai/MASTER_PROMPT.md` as the phase-by-phase build guide when building from scratch. Work one phase of `docs/06-Implementation-Plan.md` at a time; do not jump ahead to a later phase's tables/components before the current phase's acceptance criteria are met.
- **Preferred tools for this repo:** `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` — run the relevant subset before every commit, per `ai/AGENTS.md` §12.
- **Extended thinking:** reserve for genuinely ambiguous architecture decisions not already resolved in `docs/02-TRD.md`. Most implementation questions in this repo have an explicit, documented answer — check the docs before reasoning from first principles.
- **Subagent use:** this codebase is small and highly interconnected (schema ↔ pipeline ↔ UI). Prefer working sequentially in the main context over parallel subagents for feature work, since cross-file consistency (matching field names, enum values, stage contracts) matters more than parallelization speed here.
