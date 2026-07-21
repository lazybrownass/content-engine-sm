## Application Flow — LinkedIn Content Engine

Version 1.0 · Every route, state, and edge case a session can pass through

---

### 1. Route Map

```mermaid
flowchart TB
    ROOT["/"] --> AUTHCHECK{Authenticated?}
    AUTHCHECK -->|no| LOGIN["/login"]
    AUTHCHECK -->|yes, not owner| FORBIDDEN["/forbidden"]
    AUTHCHECK -->|yes, owner| DASH["/dashboard"]

    DASH --> KB["/knowledge"]
    DASH --> TOPICS["/topics"]
    DASH --> POSTS["/posts"]
    DASH --> SCHED["/schedule"]
    DASH --> ANALYTICS["/analytics"]
    DASH --> SETTINGS["/settings"]

    KB --> KBITEM["/knowledge/[id]"]
    KB --> KBNEW["/knowledge/new"]
    TOPICS --> TOPICNEW["/topics/generate"]
    POSTS --> POSTVIEW["/posts/[id]"]
    POSTVIEW --> POSTEDIT["/posts/[id]/edit"]
    SETTINGS --> SETBIZ["/settings/business-context"]
    SETTINGS --> SETSTYLE["/settings/style-memory"]
    SETTINGS --> SETMODELS["/settings/models"]
    SETTINGS --> SETPUBLISH["/settings/publishing"]
```

#### 1.1 Post Status State Machine

Every `Post` moves through the `PostStatus` enum (`05-Backend-Schema.md`) via this state machine — the authoritative shape every other flow in this document (§5, §6, §7, §8) implements a piece of:

```mermaid
stateDiagram-v2
    [*] --> DRAFT: topic accepted (§5)
    DRAFT --> PIPELINE_RUNNING: pipeline stages begin automatically
    PIPELINE_RUNNING --> GRILLING: reaches Quality Review stage
    GRILLING --> PIPELINE_RUNNING: qualityScore < minQualityScore, one bounded revision cycle (grillCycles)
    GRILLING --> NEEDS_OWNER_REVIEW: qualityScore >= minQualityScore, or the bounded cycle is exhausted
    NEEDS_OWNER_REVIEW --> IN_EDIT: owner opens the editor (§6)
    IN_EDIT --> APPROVED: approve as-is / approve with edits
    IN_EDIT --> REJECTED: reject, reason captured
    APPROVED --> SCHEDULED: owner picks a slot (§7)
    SCHEDULED --> PUBLISHING: cron dispatches the due job (§8)
    PUBLISHING --> PUBLISHED: callback signature verified, success
    PUBLISHING --> FAILED: callback signature verified, failure
    PUBLISHING --> PUBLISH_UNCONFIRMED: no verified callback within the timeout window
    PUBLISH_UNCONFIRMED --> PUBLISHED: owner confirms manually
    PUBLISH_UNCONFIRMED --> FAILED: owner marks unresolved
    FAILED --> SCHEDULED: retry, re-dispatched
    PUBLISHED --> ARCHIVED: owner archives
    REJECTED --> ARCHIVED: owner archives
```

`ARCHIVED` is reachable from most non-terminal states via an explicit owner action — omitted as individual edges above to keep the diagram readable, since it is always a soft archive, never a delete (PRD FR-11).

**The Grill loop is bounded, not iterative-until-pass:** `GRILLING` can only return to `PIPELINE_RUNNING` once, tracked by `Post.grillCycles`. Whether `qualityScore` clears `Settings.minQualityScore` (default 85) on the first pass, after the one revision cycle, or never, the post always reaches `NEEDS_OWNER_REVIEW` with the score visible — the loop cannot silently stall a post indefinitely (PRD FR-14, 02-TRD.md §4.1).

### 2. Authentication Flow

```mermaid
sequenceDiagram
    participant U as Owner (browser)
    participant MW as Next.js Middleware
    participant SB as Supabase Auth
    participant DB as Postgres (owner allow-list)

    U->>MW: GET /dashboard (no session cookie)
    MW-->>U: redirect /login
    U->>SB: Click "Continue with GitHub" / "Google" / email link
    SB-->>U: OAuth redirect + session cookie set
    U->>MW: GET /dashboard (session cookie present)
    MW->>SB: Validate session
    SB-->>MW: session valid, user email
    MW->>DB: Is email in owner allow-list?
    alt allowed
        DB-->>MW: yes
        MW-->>U: proceed to /dashboard
    else not allowed
        DB-->>MW: no
        MW-->>U: redirect /forbidden (no account creation, no data access)
    end
```

**Edge cases:**

- **Session expiry mid-edit:** the post editor autosaves drafts every 15s to a Server Action; on a 401 from any Server Action, the client shows a non-destructive "Your session expired — sign in again" modal that preserves unsaved local editor state in memory and re-submits after re-auth, rather than discarding it.
- **Logout:** clears the Supabase session and redirects to `/login`; no server-side state is cleared (nothing user-specific lives outside the database).
- **Unauthorized email:** shown `/forbidden` with no indication of what would make them authorized — this is a personal tool, not a signup flow.

### 3. Dashboard

```mermaid
flowchart LR
    D[Dashboard loads] --> A[This week's publishing cadence — X of 3-5 posted]
    D --> B[Posts awaiting approval — count + quick links]
    D --> C[Upcoming scheduled posts — next 7 days]
    D --> E[Recent knowledge additions]
    D --> F[Suggested topics — top 3 unreviewed]
    D --> G[Pipeline runs in progress/failed — needs attention]
```

Loading state: the shell (nav, page title) renders immediately; each panel (`Suspense` boundary) streams in independently with a skeleton matched to its final layout. If the AI pipeline has a failed run, a persistent (non-dismissable until resolved) banner surfaces it — failures must never be silently swallowed (PRD NFR: availability).

Empty state (first run, no knowledge yet): dashboard replaces panels with a single onboarding card: "Add your first knowledge item to get started" → links to `/knowledge/new`.

### 4. Knowledge Base Flow

```mermaid
flowchart TB
    L["/knowledge — list + search"] --> SEARCH{Search type}
    SEARCH -->|keyword| FTS[Postgres full-text search]
    SEARCH -->|semantic| VEC[pgvector similarity + rerank]
    L --> NEW["/knowledge/new — form by category"]
    NEW --> SAVE[Server Action: create]
    SAVE --> EMBED[Async: generate embedding]
    EMBED --> DONE[Item searchable]
    L --> ITEM["/knowledge/[id] — view/edit"]
    ITEM --> EDIT[Server Action: update]
    EDIT --> REEMBED[Async: re-generate embedding]
    L --> IMPORT["Bulk import — paste/markdown/CSV"]
    IMPORT --> PARSE[Parse + preview rows]
    PARSE --> CONFIRM{Owner confirms mapping}
    CONFIRM -->|yes| BULKSAVE[Create N items + queue embeddings]
    CONFIRM -->|no| IMPORT
```

**Error/edge cases:**

- Embedding generation fails (model call error): item is saved immediately (never block on the AI call) with `embedding_status = pending`; a background retry job picks it up. The item is still keyword-searchable in the meantime, just not semantically searchable — surfaced with a small "indexing…" badge, not a blocking error.
- Bulk import with malformed rows: invalid rows are shown in a rejected list with the specific validation error per row; valid rows proceed independently — partial success is allowed and communicated, not all-or-nothing.

### 5. Topic Generation Flow

```mermaid
flowchart TB
    START["/topics/generate"] --> PICKDC{Domain Context: pick one, or use default}
    PICKDC --> TRIGGER[Owner clicks Generate]
    TRIGGER --> RUN[Create pipeline_run: Knowledge Retrieval → ... → Content Opportunity Scoring, biased by the selected DomainContext]
    RUN --> POLL[UI polls run status]
    POLL --> RESULT[5+ ranked topic candidates rendered with rationale + pillar + domain context + source knowledge links]
    RESULT --> ACT{Owner action per topic}
    ACT -->|Accept| CREATEPOST[Create post in status=draft]
    ACT -->|Edit topic| EDITED[Owner-modified topic text saved, then Accept]
    ACT -->|Reject| REASON[Prompt reason code: not_relevant / already_covered / low_proof / other]
    REASON --> SUPPRESS[Suppress this exact topic for 90 days]
    CREATEPOST --> REDIRECT["/posts/[id] — pipeline begins automatically (status moves to pipeline_running)"]
```

If no Domain Context is configured yet, generation proceeds without one (niche bias is optional, not required) — see §10.1 for setup.

**Diversity enforcement (FR-4):** if the scoring stage returns candidates skewed to one pillar, the UI shows a non-blocking note ("4 of 5 topics are Case Studies — knowledge base may be thin on other pillars") rather than silently hiding candidates; the owner decides.

**Failure case:** if the pipeline run fails before producing candidates (e.g., model provider outage), the screen shows the exact failed stage, the error, and a "Retry" button — never a generic "Something went wrong."

### 6. Draft Generation & Editing Flow

```mermaid
flowchart TB
    P["/posts/[id] — pipeline stages Research → CTA run automatically after topic acceptance"]
    P --> STAGEVIEW[Stage-by-stage viewer: each completed stage shown, expandable]
    STAGEVIEW --> INTERRUPT{Owner wants to intervene mid-pipeline?}
    INTERRUPT -->|edit outline before Writing| PAUSE[Pause pipeline, edit outline, resume]
    INTERRUPT -->|no| CONTINUE[Pipeline continues unattended]
    CONTINUE --> QR{Quality Review — Grill loop, status=grilling}
    QR -->|qualityScore < minQualityScore, cycle available| REWRITE[Auto-retry Writing + Humanization with feedback; grillCycles+1]
    REWRITE --> QR
    QR -->|qualityScore < minQualityScore, cycle exhausted| FLAG[Marked needs_owner_review; qualityScore + feedback shown]
    QR -->|qualityScore >= minQualityScore| GRAMMAR[Grammar pass]
    GRAMMAR --> CTAGEN[CTA options generated]
    CTAGEN --> READY["/posts/[id]/edit — final review"]
    READY --> EDITOR[Rich text editor + inline AI actions: rewrite selection, shorten, change hook, add example]
    EDITOR --> REPEATCHECK[Repeated-phrase warning banner if similarity threshold exceeded vs last 20 posts]
    EDITOR --> DECISION{Owner decision}
    DECISION -->|Approve as-is| APPROVED[status = approved; feedback: approved_no_edit]
    DECISION -->|Approve with edits| APPROVED2[status = approved; feedback: approved_with_edit; diff stored]
    DECISION -->|Regenerate stage| REGEN[Pick stage to redo, optional owner feedback text fed into that stage's prompt]
    DECISION -->|Reject| REJECTED[status = rejected; reason captured]
```

**Edge case — regenerate from an earlier stage:** regenerating the Outline after Writing has already run invalidates (soft, not deleted) the downstream `post_versions`; the UI clearly marks them as "superseded" rather than removing history, preserving the learning-loop audit trail (PRD FR-11).

**Edge case — AI call timeout during an interactive inline action (e.g., "rewrite this paragraph"):** the editor shows the specific selection as "regenerating…" without blocking the rest of the document; on failure, the selection reverts to its prior text with a toast explaining the failure and a retry affordance.

The Grill loop above can only re-enter Writing once — see §1.1 for the full bounded state machine.

#### 6.1 Media Generation Panel Flow

Optional, opt-in per-post media generation, available from the same editor as the rest of §6:

```mermaid
flowchart TB
    READY["/posts/[id]/edit"] --> MEDIAPANEL[Media panel: Generate image/diagram or Generate video clip]
    MEDIAPANEL --> CHOOSE{Owner picks type}
    CHOOSE -->|Image/diagram| COSTIMG[Show estimated cost: ~$0.03 — Gemini Imagen 3]
    CHOOSE -->|Video clip| COSTVID[Show estimated cost: ~$0.13 — Higgsfield dop-lite]
    COSTIMG --> CONFIRM{Owner confirms the cost?}
    COSTVID --> CONFIRM
    CONFIRM -->|No| MEDIAPANEL
    CONFIRM -->|Yes| GENERATE[Create GeneratedMedia row, status=pending; call the MediaProvider]
    GENERATE --> RESULT{Generation result}
    RESULT -->|success| READYMEDIA[status=ready; asset attached to the post, costUsd recorded]
    RESULT -->|failure| FAILMEDIA[status=failed; error shown, no silent retry]
```

Generation is async, same non-blocking pattern as knowledge-item embedding (§4): the panel shows a "generating…" placeholder for the item in progress while the rest of the editor stays fully usable. A post may have zero, one, or several `GeneratedMedia` items; the owner can delete any unused one directly from the panel. No `generate()` call ever fires without the cost step and an explicit confirm immediately before it (02-TRD.md §5.8).

### 7. Scheduling Flow

```mermaid
flowchart TB
    APPROVED[Post status = approved] --> SCHEDVIEW["/schedule — calendar view"]
    SCHEDVIEW --> PICK{Owner picks a slot}
    PICK -->|manual slot| SET[Set scheduled_at]
    PICK -->|"Suggest best time"| SUGGEST[Heuristic from analytics rollups: best-performing day/hour buckets]
    SET --> PROVIDER{Publishing provider configured?}
    PROVIDER -->|yes| CREATEJOB[Create publishing_job, status=scheduled]
    PROVIDER -->|no| PROMPTCONFIG[Redirect to /settings/publishing before scheduling completes]
    CREATEJOB --> WAIT[Cron checks due jobs every 5 minutes]
```

### 8. Publishing Flow

```mermaid
flowchart TB
    DUE[Cron finds publishing_job due] --> ADAPTER{Configured provider}
    ADAPTER -->|n8n| N8N[POST to n8n webhook with post payload]
    ADAPTER -->|Make| MAKE[POST to Make webhook]
    ADAPTER -->|Playwright| PW[Trigger Playwright worker job]
    ADAPTER -->|Manual| MANUAL[Mark ready_to_publish, send reminder notification]
    N8N --> CB{Callback received?}
    MAKE --> CB
    PW --> CB
    CB -->|success| PUBLISHED[status=published, published_at set, linkedin_url stored if returned]
    CB -->|failure| FAILED[status=failed, error stored, owner notified]
    CB -->|no callback within timeout window| STALE[status=publish_unconfirmed — owner prompted to confirm manually]
    MANUAL --> CONFIRM[Owner manually marks Published after posting themselves]
```

**Failure recovery:** a `failed` publishing job can be retried (same payload, re-dispatched) or the post can be reverted to `approved` and re-scheduled. A `publish_unconfirmed` state exists specifically because webhook-based automation cannot guarantee a callback — the UI never assumes success without either a callback or explicit owner confirmation.

### 9. Analytics Flow

```mermaid
flowchart TB
    PUB[Post published] --> WAIT48[Wait ≥ 24-48h for meaningful engagement]
    WAIT48 --> INGEST{Ingestion method}
    INGEST -->|manual| FORM["/analytics — quick-entry form per post: impressions, reactions, comments, reposts"]
    INGEST -->|Playwright adapter configured| AUTO[Scheduled scrape job populates metrics]
    FORM --> STORE[analytics_snapshots row]
    AUTO --> STORE
    STORE --> ROLLUP[Rollups recomputed: by pillar, hook type, length bucket, day/time]
    ROLLUP --> LEARN[Learning loop: adjust topic scoring weights, surface top-performing patterns in style memory]
```

Empty state: before any metrics exist, `/analytics` shows a prompt to enter data for the oldest unrecorded published post rather than a blank chart.

### 10. Settings Flows

- **Business Context:** structured form (positioning statement, ideal client profile, offers/services, industries served) — this is the input every pipeline stage ultimately traces back to; changes here do not retroactively alter published posts but do affect the next generation run.
- **Style Memory:** read-only computed profile (sentence length distribution, emoji frequency, hook pattern frequency, vocabulary list) plus an owner-editable "always avoid these phrases" list and "these are examples of my voice" curated post picker (marks specific published posts as canonical style references).
- **Models:** per-stage model selection dropdown (populated from configured providers), showing current default, with a "reset to recommended" action per stage.
- **Publishing:** provider configuration (webhook URLs, Playwright session status, manual reminder preferences), each provider's connection tested via a "Send test payload" action before being marked active.

#### 10.1 Domain Context Management Flow

```mermaid
flowchart TB
    LIST["/settings/domain-context — list"] --> NEWDC[New Domain Context]
    NEWDC --> FORM[Form: category, label, vocabulary notes, tone notes, compliance notes, set as default?]
    FORM --> SAVE[Server Action: create/update]
    SAVE --> LIST
    LIST --> EDITDC[Edit an existing context]
    LIST --> ARCHIVEDC[Archive a context]
    ARCHIVEDC --> KEEP[Topics/Posts already referencing it keep their domainContextId — never broken, since the FK is nullable/SetNull]
```

An owner may configure several Domain Contexts side by side (e.g. one per niche) — this is not a single global mode switch. The consumption side of this flow is the selector shown in §5 Topic Generation Flow; a category+label pair with no matching context configured simply means generation proceeds without domain bias.

### 11. Global Error, Empty, and Loading State Conventions

| State | Convention |
|---|---|
| Loading | Skeleton components matching final content dimensions (never a generic spinner for content-shaped regions); a spinner is acceptable only for button-level, sub-second actions |
| Empty | Always actionable — an empty list state names the specific next action, never just "No data" |
| Error (recoverable) | Inline, scoped to the failed region; includes the specific cause where known and a retry action |
| Error (session/auth) | Full-page interstitial, preserves in-progress work where technically possible |
| AI pipeline failure | Names the exact failed stage, shows the error, offers retry-this-stage — never restarts the whole pipeline unless the owner explicitly chooses to |
| Automation/publishing failure | Never silently marked published; always requires either a success callback or explicit owner confirmation |

### 12. Session Lifecycle Summary

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated
    Unauthenticated --> Authenticating: OAuth/email flow
    Authenticating --> Forbidden: email not on allow-list
    Authenticating --> Authenticated: email on allow-list
    Authenticated --> Unauthenticated: logout or session expiry
    Forbidden --> Unauthenticated: back to login
    Authenticated --> Authenticated: normal navigation, autosave, pipeline polling
```
