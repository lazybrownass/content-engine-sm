## Product Requirements Document — LinkedIn Content Engine

Version 1.0 · Owner: Sajid · Status: Approved for implementation

---

### 1. Summary

The LinkedIn Content Engine is a single-owner, internally-used web application that turns a founder's raw knowledge — projects, case studies, lessons learned, opinions — into LinkedIn posts that read like they were written by an experienced creator, not a language model. It replaces the current ad-hoc process (open a blank editor, stare at it, write something generic, post inconsistently) with a repeatable pipeline: capture knowledge once, generate topic ideas from it, draft and refine posts through a multi-stage AI pipeline, review and schedule them, and feed publishing results back into the system so future posts get better.

This is not a SaaS product. There is one user. There is no billing, no team management, no public signup. Every design decision in this document optimizes for a single power user's daily workflow, not for scale or generality.

### 2. Problem Statement

Consistent, high-quality LinkedIn posting is one of the highest-leverage activities for an independent software consultant/founder building a client pipeline, but it fails in practice for three concrete reasons:

| Failure mode | Root cause | Cost |
|---|---|---|
| Inconsistent publishing | No system forces a cadence; posting depends on daily motivation | Algorithm deprioritizes inactive accounts; audience growth stalls |
| Generic-sounding posts | Blank-page writing defaults to clichés ("I'm excited to announce...") or, when AI-assisted, to detectable AI patterns (triads, "let's dive in", em-dash overuse, generic CTAs) | Lower engagement, damages perceived expertise |
| Lost knowledge | Case studies, client wins, and lessons learned live in Slack threads, memory, and old proposals — never turned into content | Real proof points that would win clients never get published |

The tool exists to remove all three failure modes by making content production a pipeline with persistent memory, not a one-off creative act.

### 3. Goals

1. Reduce the time from "I have an idea or a knowledge item" to "a scheduled, on-brand LinkedIn post" to under 10 minutes of active owner time (the AI pipeline does the rest asynchronously).
2. Produce drafts that pass a "would I post this without heavy editing" bar at least 70% of the time, measured by owner approval rate without edits vs. with edits vs. rejected.
3. Maintain a queryable, growing knowledge base that becomes the single source of truth for what the business has done, so no case study or lesson is ever "forgotten."
4. Build a style-memory system that measurably reduces repetition (same hook, same CTA, same phrase) across the last 20 published posts.
5. Make publishing provider-agnostic so the owner is never blocked by a single automation vendor's policy change.
6. Ship a tool the owner actually opens daily — which means it must be fast, calm, and free of unnecessary friction (see Section 8, UX principles).

### 4. Non-Goals (explicit out-of-scope)

- **Multi-tenant / multi-user support.** No org accounts, no team roles, no invite flows. The schema and auth model may technically support more than one `User` row (for future-proofing), but no feature will be built around it.
- **Official LinkedIn API integration.** LinkedIn's Share/Marketing API requires partner approval unavailable to individual developers for posting on behalf of a member; the product deliberately routes around this (see TRD §6).
- **Other social platforms.** X/Twitter, Threads, Instagram are not in scope for v1. The publishing adapter architecture should not accidentally preclude them later, but no adapter will be built for them now.
- **Content plagiarism detection / fact-checking against the open web.** The system trusts the owner-provided knowledge base; it is not a research-verification tool.
- **Mobile native app.** Responsive web only.
- **Billing, subscriptions, usage metering for other users.** N/A — single owner.
- **Fully autonomous publishing without review.** Every post requires explicit owner approval before it leaves draft state, at least for v1 (see Section 9, human-in-the-loop is a hard requirement, not a preference).

### 5. Target User (Persona)

**Sajid — Founder/Consultant, sole user.**

- Runs a software/AI consulting practice; LinkedIn is the primary top-of-funnel channel.
- Technically sophisticated (comfortable editing prompts, reviewing AI output, tolerates a utilitarian UI over a "polished SaaS" one) but time-constrained — the tool must save time, not become a new chore.
- Wants to publish 3–5x per week across a fixed set of content pillars (see Section 6).
- Cares more about *not sounding like everyone else's AI-generated LinkedIn post* than about generation speed.
- Will be the only account that ever logs in. Optimize every screen for someone who already knows the system, not for onboarding a stranger.

### 6. Content Pillars

The system should classify and generate content against a fixed taxonomy stored in the knowledge base's `industries`/`topics` and used to bias topic generation:

| Pillar | Purpose | Example angle |
|---|---|---|
| Build in Public | Trust, transparency, relatability | "Here's what broke in production this week and what I changed" |
| Case Studies | Proof, client attraction | "How we cut a client's onboarding time from 12 minutes to 90 seconds" |
| Technical Insights | Authority with technical buyers | "Why we chose Postgres + pgvector over a dedicated vector DB" |
| Founder Story | Relatability, personal brand | "The client I almost didn't take — and what it taught me about scoping" |
| Lessons Learned | Authority + vulnerability | "Three assumptions that cost us two weeks on a recent build" |
| Educational | Top-of-funnel authority | "A simple mental model for when to use SSR vs CSR" |
| Marketing / Business Growth | Positions expertise beyond code | "Why most agencies underprice discovery calls" |

Every generated post is tagged with exactly one primary pillar and optionally secondary tags; this tagging drives both topic diversity enforcement (Section 9) and analytics rollups (Section 12).

### 7. Core Features

#### 7.1 Knowledge Base
- Structured capture of: projects, products, case studies, client wins, lessons learned, services, portfolio items, FAQs, writing style notes, brand voice notes, industries, target clients, experience/background, previous posts (imported), and freeform ideas.
- Each item is chunked and embedded for semantic retrieval (TRD §5).
- Manual entry via forms, and bulk import (markdown/CSV/paste) for migrating existing notes.
- Full-text + semantic hybrid search across the whole base.

#### 7.2 Topic Generation
- Given the knowledge base, business context, and target audience/pain-point definitions, the system proposes ranked topic candidates ("content opportunities") with a rationale for why each is worth writing and which pillar/knowledge items it draws from.
- Owner can accept, reject, edit, or manually add a topic. Rejections are logged as negative signal (Section 13, Learning Loop).

#### 7.3 Multi-Stage Draft Generation
- A topic moves through the pipeline defined in TRD §4 (Knowledge → Business Context → Audience → Pain Points → Opportunity → Topic → Research → Outline → Writing → Humanization → Quality Review → Grammar → CTA). Each stage is independently inspectable — the owner can see and edit the outline before writing happens, see the raw draft before humanization, etc.
- Full stage output history is persisted (`post_versions`) so any step can be regenerated without redoing the whole pipeline.

#### 7.4 Editing
- Rich-text editor for the final draft with inline AI actions (rewrite selection, shorten, add example, change hook, adjust tone) — each a scoped, cheap model call rather than a full pipeline re-run.
- Diff view between pipeline stages.
- Manual override always wins; the AI never re-overwrites a manually edited field without explicit re-generation request.

#### 7.5 Scheduling & Publishing
- Calendar view of scheduled and published posts.
- Publishing is abstracted behind a provider interface (TRD §6): n8n, Make.com, Playwright-based browser automation, and manual (copy-to-clipboard + reminder) are all first-class, swappable providers.
- A post cannot auto-publish without having passed the approval gate (status = `approved`).

#### 7.6 Analytics & Learning Loop
- Post-level performance (impressions, reactions, comments, shares, CTR where obtainable) ingested via the same adapter pattern used for publishing (manual entry as the baseline path, since there is no official analytics API either).
- Performance data feeds back into topic ranking and style memory: pillars/hooks/formats that outperform are weighted up in future topic and outline generation.

#### 7.7 Style Memory
- Continuously updated profile of the owner's actual writing: sentence length distribution, emoji frequency, hook patterns, storytelling structures, CTA phrasing, vocabulary preferences, explicitly avoided phrases (owner-curated blocklist), and phrases that are becoming repetitive (frequency-tracked across the last N posts) so the model is told to avoid them.
- The blocklist explicitly includes common "AI slop" markers (see TRD §7 for the enforced list) regardless of what the owner's own style looks like.

#### 7.8 Settings
- Business context (positioning, ICP, offers), target audience and pain-point definitions, brand voice notes, model configuration per pipeline stage, publishing provider configuration, notification preferences.

### 8. UX Principles

1. **Calm over flashy.** This is a daily-use tool, not a marketing site. Every animation, color, and interaction must justify its presence.
2. **Editable at every stage.** The owner should never feel like the AI is a black box; every intermediate artifact is visible and editable.
3. **Fast to review, not fast to publish.** Optimize the review step (compare draft vs. style, one-click approve/edit/regenerate) more than the generation step, because review is the human bottleneck.
4. **Never silently auto-publish.** Approval is a deliberate, visible action.
5. **Zero-config on repeat use.** After the first setup of business context and style memory, day-to-day use should require no new configuration.

### 9. Functional Requirements (numbered, testable)

| ID | Requirement |
|---|---|
| FR-1 | System shall allow creating, editing, and archiving knowledge items across all 13 categories listed in §7.1. |
| FR-2 | System shall generate vector embeddings for every knowledge item on create/update and support semantic search with a relevance score. |
| FR-3 | System shall generate a ranked list of at least 5 topic candidates on demand, each citing the knowledge items and pillar it draws from. |
| FR-4 | System shall enforce topic diversity: no two topics generated in the same batch may share the same primary pillar unless fewer than 3 pillars have eligible knowledge. |
| FR-5 | System shall persist the output of every pipeline stage as an immutable `post_version` record, addressable and diffable. |
| FR-6 | System shall block any transition to `scheduled` or `published` status unless the post's status is `approved`. |
| FR-7 | System shall support at least these publishing providers at launch: n8n (webhook), Make.com (webhook), Playwright (self-hosted worker), Manual (copy + reminder). Adding a new provider shall require implementing one interface and no changes to core post/schedule logic. |
| FR-8 | System shall record every AI pipeline invocation (stage, model, prompt template version, input/output token counts, latency, cost, status) in `ai_runs`. |
| FR-9 | System shall track a rolling repeated-phrase index over the last 20 published posts and surface a warning in the editor when a draft reuses a phrase above a configurable similarity threshold. |
| FR-10 | System shall allow manual entry of post performance metrics and, when a Playwright-based analytics adapter is configured, ingest them automatically on a schedule. |
| FR-11 | System shall never delete a knowledge item or published post record; deletions are soft (archived) to preserve the learning-loop history. |
| FR-12 | System shall support per-stage model configuration (which model handles Writing vs. Quality Review, etc.) without a code deploy — configuration lives in the database, not hardcoded. |

### 10. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard and post-list pages achieve Lighthouse Performance ≥ 95 on a cold load; server-rendered content visible (FCP) < 1.2s on a typical broadband connection. |
| Availability | Single-owner tool; 95%+ uptime is acceptable (no SLA obligations), but AI pipeline failures must degrade gracefully (retry + visible failure state), never silently lose a draft. |
| Cost | AI inference cost must default to $0/month using free-tier providers; any paid fallback requires explicit opt-in (see TRD §5.6). |
| Security | Single authenticated owner; all data access enforced via Postgres RLS keyed to the authenticated user, even though there is only one. Secrets never stored in the database in plaintext. |
| Accessibility | WCAG 2.1 AA across all screens; full keyboard operability, including the command palette and editor. |
| Data portability | Knowledge base and posts exportable as JSON/Markdown at any time — this is the owner's business data and must never be locked in. |

### 11. Success Metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Posts published / week | ≥ 3 |
| Draft approval rate without heavy edit | ≥ 70% |
| Time from topic acceptance to scheduled post | ≤ 10 minutes active owner time |
| Repeated-phrase warnings triggered | Trending down month over month |
| Knowledge items in base | ≥ 40 within first 30 days (backfill of existing case studies/lessons) |
| Monthly AI inference spend | $0 (free tier) under normal usage volume (~20–30 pipeline runs/month) |

### 12. Reporting & Analytics Requirements

- Per-post: impressions, reactions, comments, reposts, engagement rate, CTR (if link included).
- Rollups by pillar, by hook type, by post length bucket, by day-of-week/time posted.
- Trend view: engagement rate over time, to validate whether style-memory tuning is actually improving output.

### 13. Learning Loop Requirements

- Every owner action that signals quality (approve-as-is, approve-with-edits, reject, regenerate-with-feedback) is captured in `feedback` and associated with the specific pipeline stage and prompt template version that produced the output.
- Approved-without-edit posts are the strongest positive signal and are prioritized when building few-shot examples for future Writing/Humanization stage prompts.
- Rejected topics/drafts are captured with the owner's stated reason (structured reason codes + optional free text) and excluded from being re-suggested for 90 days.

### 14. Risks & Assumptions

| Risk | Mitigation |
|---|---|
| Free-tier AI models produce inconsistent quality | Multi-stage pipeline with a dedicated Quality Review stage; per-stage model swap without code change; human approval gate before publish |
| Free-tier inference rate limits block a pipeline run | Provider fallback chain + async job queue with retry/backoff (TRD §5.6) |
| No official publishing API means automation is inherently fragile (LinkedIn UI/session changes) | Adapter abstraction + Manual provider as guaranteed fallback that never breaks |
| Single point of failure (one owner, one account) is acceptable | Explicitly accepted — this is a personal tool, not infrastructure for a business's continuity |
| Style memory converges to sameness/self-plagiarism | Repeated-phrase detection (FR-9) and diversity enforcement (FR-4) act as guardrails |

### 15. Open Questions Resolved by This Document

These are intentionally decided here (per project instructions to avoid unresolved ambiguity) rather than left for the implementing agent to guess:

1. **Human approval is mandatory for v1.** Full autonomy (auto-publish without review) is an explicit non-goal until the approval-without-edit rate has been proven ≥ 90% over a sustained period — this is a v2 decision, not built now.
2. **Analytics ingestion has no reliable automated source at launch.** Manual entry is the primary path; a Playwright-based scraper is a documented optional enhancement, not a launch blocker.
3. **Single-owner does not mean single-user schema.** The schema includes a `users` table and `owner_id` foreign keys everywhere (see 05-Backend-Schema.md) so RLS and future multi-owner support (e.g., a second personal account) are structurally possible without a rewrite — but no UI is built to manage more than one.
