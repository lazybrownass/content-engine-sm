## MASTER_PROMPT.md

Long-term build instructions for Claude Code. Paste this into a Claude Code session in the repository root immediately after `create-next-app` has scaffolded the Next.js 16 project (Phase 0 prerequisites: App Router, TypeScript, Tailwind CSS v4, ESLint selected during init).

---

You are building the LinkedIn Content Engine, a single-owner internal tool. Before writing any code, read these files in full, in this order:

1. `ai/AGENTS.md` — the rules you operate under for this entire project. Everything in it is binding.
2. `docs/01-PRD.md` — what this product is and why it exists.
3. `docs/02-TRD.md` — the technical architecture and every stack decision, with rationale.
4. `docs/03-App-Flow.md` — every user journey, including error/empty/loading states.
5. `docs/04-UI-UX-Design-Brief.md` — the design system you must implement against.
6. `docs/05-Backend-Schema.md` — the full database schema.
7. `docs/06-Implementation-Plan.md` — the phased build order, folder structure, and standards you follow.

Do not start implementing before you have read all seven. If any instruction in this prompt appears to conflict with those documents, the documents win — treat this prompt as a process guide, not a source of new requirements.

### How you work

**Phase by phase, in order.** `docs/06-Implementation-Plan.md` §4 defines seven phases (0 through 6). Complete each phase's tasks, verify its acceptance criteria, and confirm its Definition of Done before starting the next phase. Do not build Phase 3 UI against Phase 2 pipeline code that hasn't been verified working — verify as you go, not at the end.

**One coherent change per commit.** After finishing a task from the phase's task table, commit it with a Conventional Commit message (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`), scoped where it clarifies (`feat(pipeline): implement outline stage`). Run lint, typecheck, and the relevant test suite before every commit. Push automatically once local checks are clean — do not wait for explicit permission to push a clean, working commit, but do not push broken or half-finished work.

**Never skip testing.** Every phase in `docs/06-Implementation-Plan.md` names its testing requirements. A phase is not complete without them — "I'll add tests later" is not an acceptable state to leave a phase in. Follow `docs/06-Implementation-Plan.md` §6 for what belongs at each test layer, and remember: never assert on real AI model output in tests — mock the model call and assert on shape/parsing/error-handling.

**Never skip documentation.** If you make an implementation decision that changes what `docs/*.md` specifies — a different model for a stage, a schema field added that wasn't in `05-Backend-Schema.md`, a UI pattern not covered in `04-UI-UX-Design-Brief.md` — update the relevant document in the same commit or the immediately following one. The documentation describes the actual system. Do not let it drift into fiction.

**Never introduce unnecessary dependencies.** Before adding any package, check: does something already in the stack (Next.js, React, Prisma, shadcn/ui, Tailwind, the libraries explicitly named in `docs/02-TRD.md`) already solve this? This is a small, solo-maintained codebase — every dependency is a long-term liability. If you do need something new, it should be traceable to a specific requirement in `docs/01-PRD.md` or `docs/02-TRD.md`, not general best practice.

**Prefer SSR. Prefer Server Components.** Default every new file to a Server Component. Add `"use client"` only when the file genuinely needs it, and keep that boundary as small and deep in the tree as possible. See `ai/AGENTS.md` §3 for the specific rules.

**Keep bundle size minimal.** Check what a change does to the client bundle before considering it done, especially for the editor, charts, and command palette — these are the only places heavy client code belongs.

**Avoid overengineering.** This tool has one user. Do not build multi-tenancy, configurable permission systems, plugin architectures, or generalized abstractions "for the future." The provider abstraction (publishing) and the model router (AI) are the two places genuine extensibility is warranted — they exist because `docs/02-TRD.md` explicitly requires swappable providers and models. Everywhere else, write the direct, specific solution.

**Avoid AI-generated boilerplate.** Do not pad files with defensive code, redundant comments restating what the code obviously does, or speculative configuration options nothing in the docs asks for. Every line should earn its place.

**Always explain tradeoffs.** When you make a non-obvious implementation choice not already dictated by the docs, say so — in a commit message if it's small, in an update to the relevant doc if it's architecturally meaningful. Silent, undocumented deviation from the spec is the failure mode this whole documentation set exists to prevent.

### What you must never include

- No `Co-authored-by` trailers of any kind in commit messages.
- No "Generated with Claude Code," "AI-assisted," or any other AI-attribution text in commits, code comments, or documentation.
- No contributor metadata referencing an AI agent anywhere in the repository.

Commits should read exactly as if written by the human owner of this codebase. This is a firm requirement, not a stylistic preference.

### Working session structure

For each phase:

1. Re-read the phase's section in `docs/06-Implementation-Plan.md` §4 (objectives, tasks, acceptance criteria, risks, DoD).
2. Work through the task table top to bottom, committing after each completed task.
3. Before moving to the next phase, verify every acceptance criterion listed for the current phase — actually run the app and check, don't assume.
4. If you hit a decision point not resolved by `docs/*.md`, make the smallest, most boring choice consistent with the architecture already documented, note the decision and rationale in the relevant doc, and continue. Do not stop and wait unless the decision would contradict an explicit rule in `ai/AGENTS.md` §11 (things you must never do) — those require a real conversation with the owner, not a judgment call.

### Definition of done, restated

A phase is done when: its acceptance criteria in `docs/06-Implementation-Plan.md` are verifiably met, its required tests exist and pass, its Definition of Done statement is satisfied, `ai/AGENTS.md` §15's review checklist passes for every change in the phase, and no documentation has silently drifted from what was actually built.

Begin with Phase 0.
