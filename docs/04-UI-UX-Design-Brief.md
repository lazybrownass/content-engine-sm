## UI/UX Design Brief — LinkedIn Content Engine

Version 1.0 · Design system + component specification

---

### 1. Design Philosophy

The reference points are Vercel's dashboard, Linear, and Stripe's internal tooling — not consumer SaaS marketing sites. The owner opens this tool daily; it must disappear into the workflow rather than demand attention. Every visual decision below is justified against that goal, not against generic "modern SaaS" aesthetics.

Principles, in priority order:

1. **Legibility over decoration.** Text is the product (it's a writing tool); typography and spacing get more design budget than color or iconography.
2. **Restraint in color.** One primary color (green), used sparingly for actionable/active states. Everything else is grayscale. Color is a signal, not a decoration — if everything is green, nothing is.
3. **Density with breathing room.** This is a power-user tool used daily, so information density is acceptable (unlike a marketing site), but never at the cost of whitespace around interactive elements — cramped controls cause misclicks and fatigue over daily use.
4. **Motion is functional only.** Transitions communicate state change (expanding a stage, saving a draft); nothing animates purely for delight.

### 2. Color System

Defined as CSS variables (Tailwind v4 native CSS-variable theming, no JS config file).

```css
:root {
  /* Neutrals — soft gray scale, warm-neutral not blue-neutral */
  --color-bg: #ffffff;
  --color-bg-subtle: #fafafa;
  --color-bg-muted: #f4f5f4;
  --color-border: #e5e7e5;
  --color-border-strong: #d1d5d1;
  --color-text-primary: #16181a;
  --color-text-secondary: #52565a;
  --color-text-tertiary: #8a8f92;
  --color-text-disabled: #b8bcbe;

  /* Primary — green, used for primary actions, active/success states, brand accents */
  --color-primary-50: #f0faf3;
  --color-primary-100: #dcf3e3;
  --color-primary-300: #7fd99c;
  --color-primary-500: #1f9d55;   /* primary brand green */
  --color-primary-600: #18823f;   /* hover/active */
  --color-primary-700: #146a34;   /* pressed */
  --color-primary-contrast: #ffffff;

  /* Semantic */
  --color-warning-bg: #fff8e6;
  --color-warning-text: #92660b;
  --color-danger-bg: #fdecec;
  --color-danger-text: #b3261e;
  --color-danger-solid: #d92d20;
  --color-info-bg: #eef6ff;
  --color-info-text: #1d5fa8;

  /* Elevation shadows — soft, low-contrast, never heavy drop shadows */
  --shadow-xs: 0 1px 2px rgba(16, 24, 16, 0.04);
  --shadow-sm: 0 1px 3px rgba(16, 24, 16, 0.06), 0 1px 2px rgba(16, 24, 16, 0.04);
  --shadow-md: 0 4px 12px rgba(16, 24, 16, 0.08);
  --shadow-lg: 0 12px 32px rgba(16, 24, 16, 0.12);
}

[data-theme="dark"] {
  --color-bg: #0e0f10;
  --color-bg-subtle: #17181a;
  --color-bg-muted: #1f2022;
  --color-border: #2a2c2e;
  --color-border-strong: #3a3d3f;
  --color-text-primary: #f2f3f2;
  --color-text-secondary: #b3b7b5;
  --color-text-tertiary: #7d8280;
  --color-primary-500: #34c874;
  --color-primary-600: #2aa860;
  --color-primary-700: #22884d;
}
```

Dark mode is optional per the brief; it is implemented as a `data-theme` toggle stored in a cookie (read server-side to avoid a flash of wrong theme on SSR) rather than `prefers-color-scheme` alone, so the owner's choice persists deliberately.

**Contrast requirement:** every text/background pairing above meets WCAG AA (4.5:1 for body text, 3:1 for large text/UI components). `--color-primary-500` on white is used for icons/borders, never as a background for small body text without a contrast check — primary-600/700 are used when text sits on a green background.

### 3. Typography

| Token | Font | Size | Weight | Line height | Usage |
|---|---|---|---|---|---|
| `--font-sans` | Inter (via `next/font`, self-hosted, no external request) | — | — | — | UI text |
| `--font-mono` | JetBrains Mono (via `next/font`) | — | — | — | Prompt template editor, code-like values (IDs, JSON) |
| `text-display` | Inter | 32px / 2rem | 600 | 1.2 | Page-level headers used sparingly (e.g., empty state) |
| `text-h1` | Inter | 24px | 600 | 1.3 | Page title in top bar |
| `text-h2` | Inter | 18px | 600 | 1.35 | Section headers, card titles |
| `text-h3` | Inter | 15px | 600 | 1.4 | Subsection headers |
| `text-body` | Inter | 14px | 400 | 1.6 | Default UI text |
| `text-body-lg` | Inter | 16px | 400 | 1.7 | Post editor body copy — larger for sustained reading/writing |
| `text-small` | Inter | 13px | 400 | 1.5 | Metadata, timestamps, helper text |
| `text-caption` | Inter | 12px | 500 | 1.4 | Badge text, table headers (uppercase, letter-spacing 0.02em) |

Editor body copy is intentionally larger (16px/1.7) than the rest of the UI (14px) because the owner spends the most sustained, careful attention there — this is the one place where "reading comfort" outranks "information density."

### 4. Spacing & Grid

8px base unit, exposed as Tailwind spacing scale (Tailwind v4 defaults already follow a 4px scale; this project standardizes on multiples of 8 for layout-level spacing and allows 4px increments only for icon/text-adjacent micro-spacing).

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Icon-to-label gap |
| `space-2` | 8px | Tight control padding |
| `space-3` | 12px | Default form field padding |
| `space-4` | 16px | Card padding, default gap between related elements |
| `space-6` | 24px | Gap between distinct sections within a card |
| `space-8` | 32px | Gap between cards/panels |
| `space-12` | 48px | Page-level top margin, gap between major page regions |

**Grid:** 12-column responsive grid, max content width `1280px` centered, page horizontal padding `24px` mobile / `40px` desktop. Dashboard panels use a `2fr / 1fr` split (primary content / activity rail) above `1024px`, stacking to single column below.

### 5. Border Radius & Elevation

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 6px | Badges, tags, inline buttons |
| `radius-md` | 10px | Buttons, inputs, small cards |
| `radius-lg` | 14px | Cards, panels, modals |
| `radius-full` | 9999px | Avatars, pill badges, status dots |

Elevation uses the shadow tokens in §2 — `shadow-xs` for resting cards, `shadow-md` for popovers/dropdowns, `shadow-lg` reserved for modals only. No card ever uses more than one elevation level at rest; elevation increases only on temporary overlay content.

### 6. Iconography

**Lucide icons** (already available via `lucide-react`, consistent with shadcn/ui defaults). Stroke width `1.75px` at 20px default size, `1.5px` at 16px small size for optical consistency. Icons are never purely decorative in a control — every icon-only button has an accessible label via `aria-label` and a tooltip on hover/focus.

### 7. Core Components

#### 7.1 Buttons

| Variant | Usage | Visual |
|---|---|---|
| Primary | One per view maximum — the single most important action (Approve, Generate, Save) | Solid `--color-primary-500`, white text, `radius-md` |
| Secondary | Supporting actions | White bg, `--color-border-strong` border, `--color-text-primary` text |
| Ghost | Low-emphasis actions, toolbar items | Transparent, hover → `--color-bg-muted` |
| Destructive | Reject, delete, cancel-publish | `--color-danger-solid` solid or outline depending on severity |
| Sizes | `sm` (32px height), `md` (36px, default), `lg` (44px, used for the single primary CTA on the editor's approval bar) |

All buttons: focus-visible ring (`2px solid --color-primary-500`, `2px offset`), disabled state at 40% opacity with `cursor-not-allowed`, loading state replaces label with a spinner + keeps button width fixed (no layout shift).

#### 7.2 Forms

- Inputs: `radius-md`, `1px solid --color-border`, `12px 14px` padding, focus → border `--color-primary-500` + subtle `0 0 0 3px --color-primary-100` ring.
- Labels always visible above the field (no placeholder-as-label anti-pattern); helper text below in `text-small`/`--color-text-tertiary`; error text replaces helper text in `--color-danger-text` with an inline icon.
- Every form uses Zod schema validation shared between client (immediate feedback) and Server Action (source of truth) — see `02-TRD.md` §7.

#### 7.3 Tables

Used for knowledge base list, `ai_runs` log, `publishing_jobs` history. Zebra-free (relies on row hover + border, not alternating background, to stay calm); sticky header on scroll; row hover → `--color-bg-subtle`; sortable column headers show a chevron only on hover/active sort.

#### 7.4 Cards

Default card: `radius-lg`, `shadow-xs`, `1px solid --color-border`, `--space-4` to `--space-6` internal padding. Interactive cards (clickable list items) add `shadow-sm` + subtle `translateY(-1px)` on hover, transition `150ms ease-out` — the only hover-motion in the system, reserved for genuinely clickable cards.

#### 7.5 Empty States

Structure: icon (muted, 32px) → `text-h3` headline naming what's missing → `text-body`/`--color-text-secondary` one-line explanation → primary button naming the specific next action. Never a bare "No data" message (App Flow §11).

#### 7.6 Loading States / Skeletons

Skeleton blocks (`--color-bg-muted`, subtle shimmer animation, `1.5s` linear infinite, respects `prefers-reduced-motion` by disabling the shimmer and showing a static block) sized to match the real content they replace — card skeletons match card dimensions, table row skeletons match row height. Full-page spinners are disallowed except during the initial auth check before any layout is known.

#### 7.7 Dialogs / Modals

shadcn/ui `Dialog` primitive (Radix-based). Used sparingly — only for genuinely interrupting decisions (confirm reject, confirm delete, provider test-connection results). Max width `480px` for confirmation dialogs, `720px` for content-bearing dialogs (e.g., viewing a `post_version` diff). Focus trapped, `Escape` closes unless a destructive action is mid-flight.

#### 7.8 Command Palette

`Cmd/Ctrl+K` opens a global command palette (shadcn/ui `Command` + `cmdk`) for: navigating to any route, jumping to a specific post by title, triggering "Generate topics," triggering "New knowledge item." This is the primary power-user acceleration path given the single-user, daily-use context — it substitutes for a heavier nav structure.

#### 7.9 Notifications (Toasts)

Bottom-right, `shadcn/ui` `Sonner`-based. Used for: async action confirmations (saved, approved, scheduled), non-blocking failures (inline AI action failed). Never used for information the owner must act on later — those become dashboard banner items instead, since toasts disappear and a required action must not be lose-able.

#### 7.10 Charts

Analytics visualizations use **Recharts** (React-native, SSR-safe with client-boundary wrapping, matches the "minimal dependency" principle better than a heavier charting suite). Chart palette: primary green for the "this metric" series, gray-400 for comparison/benchmark series — never more than 3 series in one chart; split into multiple small charts instead of one dense multi-series chart (Vercel-dashboard convention).

#### 7.11 Badges & Tags

| Type | Usage | Style |
|---|---|---|
| Status badge | Post status — see §7.12 for the full 13-value mapping | `radius-full`, `text-caption`, colored bg at 10% opacity of semantic color + full-opacity text |
| Pillar tag | Content pillar label | `radius-sm`, neutral gray bg, used consistently across topics/posts/analytics for scannability |
| Model tag | Which model produced a stage output (shown in stage viewer) | `radius-sm`, monospace text, `--color-bg-muted` |

#### 7.12 Post Status Badges

All 13 `PostStatus` values (`05-Backend-Schema.md`) map onto the existing semantic color tokens from §2 — no new colors are introduced; per the "restraint in color" principle (§1), the mapping groups by meaning, not by giving every status its own hue:

| Bucket | Color token | Statuses | Why this bucket |
|---|---|---|---|
| Neutral | `--color-text-tertiary` on `--color-bg-muted` | `DRAFT`, `REJECTED`, `ARCHIVED` | Not yet started, or deliberately, calmly ended — none of these are errors, so none get warning/danger treatment |
| Info (blue) | `--color-info-text` on `--color-info-bg` | `PIPELINE_RUNNING`, `IN_EDIT`, `SCHEDULED`, `PUBLISHING` | Something — system or owner — is actively in motion right now |
| Warning (amber) | `--color-warning-text` on `--color-warning-bg` | `GRILLING`, `NEEDS_OWNER_REVIEW`, `PUBLISH_UNCONFIRMED` | Uncertain or needs owner attention, but not a failure |
| Primary (green) | `--color-primary-700` on `--color-primary-100` | `APPROVED`, `PUBLISHED` | Successful, settled states |
| Danger (red) | `--color-danger-text` on `--color-danger-bg` | `FAILED` | Reserved exclusively for genuine failures — never used for `REJECTED`, which is a normal owner decision, not an error |

Every status badge pairs its color with the status label text (never color alone, per §10 Accessibility). `GRILLING` additionally renders a small spinner icon inline (see §8) so it reads as "in progress" even before the owner reads the label.

#### 7.13 Domain Category Badge

`DomainContext.category` (`TECH`, `HEALTH`, `REAL_ESTATE`, `FINANCE`, `MARKETING`, `OTHER`) is shown the same way the existing Pillar tag is — `radius-sm`, neutral `--color-bg-muted` background, no per-category color — six colors for a taxonomy tag would directly violate the "one primary color, everything else grayscale" principle (§1). Categories are instead distinguished by a small Lucide icon (16px, `1.5px` stroke) paired with the text: `Cpu` (Tech), `HeartPulse` (Health), `Home` (Real Estate), `Landmark` (Finance), `Megaphone` (Marketing), `Tag` (Other). The badge shows the `DomainContext.label` free-text field as the primary text (e.g. "Residential Real Estate — First-Time Buyers") with the category icon as a secondary, smaller-scale cue — the enum categorizes for rollups, the label is what the owner actually reads.

### 8. Pipeline Stage Viewer (signature component)

This is the one genuinely novel component in the system — the visual representation of a post moving through the 12-stage pipeline (`02-TRD.md` §4). Design:

- Vertical stepper, each stage a row: status icon (pending/running/done/failed) → stage name → collapsed one-line summary of output → expand chevron.
- Running stage shows an indeterminate progress bar (not a percentage — stage duration is unpredictable) and the model name being used.
- Failed stage expands automatically, shows the error and a "Retry this stage" button inline — no need to scroll to find it.
- Completed stages are collapsed by default (reduce scroll fatigue on a 12-stage list) but expandable to inspect full input/output — this is the "editable at every stage" UX principle from `03-App-Flow.md` made concrete.
- **Quality Review row (the "Grill" loop, `02-TRD.md` §4.1) is a specialized variant of the generic row above:**
  - While `Post.status = GRILLING`, the row's status icon is a distinct amber spinner (not the generic blue "running" spinner every other stage uses) — the owner should be able to tell at a glance that self-critique, not generation, is happening.
  - Once a `qualityScore` exists, a small circular 0–100 gauge (`radius-full` ring) renders inline in the row, labelled with the number and the active gate (e.g. "72 / 85"). The ring is primary-green when the score clears `Settings.minQualityScore`, warning-amber when it doesn't — paired with the visible number, never color alone.
  - If the bounded revision cycle has fired, the row shows a small "Revision 1 of 1" indicator (from `Post.grillCycles`) so the owner understands this is a bounded retry, not an open-ended loop.
  - The row auto-expands whenever the gate isn't cleared (same auto-expand behavior as a failed stage) into a **self-critique feedback drawer**: the gauge at the top, followed by the structured rubric breakdown (banned-pattern hits, DomainContext tone/vocabulary match, hook strength, specificity) as a short list, each item flagged with a check or warning icon — same icon-plus-text visual language as the repeated-phrase warning banner, never a color-only flag.

#### 8.1 Domain Context Selector & Management UI

- **Selector** (used on `/topics/generate`, `03-App-Flow.md` §5): a shadcn/ui `Select`/`Combobox` where each option shows the `DomainContext.label` with its category badge (§7.13) inline; the context with `isDefault = true` is pinned at the top as "Default"; if none are configured yet, the control shows an empty state inline linking to `/settings/domain-context` rather than being disabled silently.
- **Management** (`/settings/domain-context`): standard list table (§7.3) — columns: label, category badge, a "Default" chip on the default row, archived toggle. Row click opens the edit form: `label` (text input), `category` (Select, the 6 enum options), `vocabularyNotes`/`toneNotes`/`complianceNotes` (three separate `Textarea` fields, each with helper text explaining its purpose, per `01-PRD.md` §6.2), and a "Set as default" switch. Archiving uses the existing confirmation-dialog pattern (§7.7) — copy explicitly states that Topics/Posts already referencing this context are unaffected (`03-App-Flow.md` §10.1), since this is a soft archive, not a delete, and shouldn't read as more destructive than it is.

#### 8.2 Media Generation Panel

A `Sheet` (shadcn/ui drawer, slides from the right) opened from a toolbar button on `/posts/[id]/edit` — a drawer rather than a modal because media generation is a supporting, dismissible side task, not an interrupting decision (§7.7 reserves modals for those).

- **Provider toggle:** a two-option segmented control — "Image / Diagram — Gemini Imagen 3" vs. "Video Clip — Higgsfield dop-lite" — a toggle rather than a dropdown since there are exactly two, both worth showing at all times.
- **Prompt input:** a `Textarea`, pre-filled with a suggestion derived from the post's content but fully editable.
- **Cost confirmation badge:** sits directly above the Generate button, `radius-sm`, warning color (`--color-warning-bg`/`--color-warning-text` — cost is attention-worthy the same way `NEEDS_OWNER_REVIEW` is, not an error), reading "~$0.03 per generation" or "~$0.13 per generation" depending on the toggle, updating live. The badge being unavoidably inline (not a separate confirmation checkbox) is the confirmation step itself — consistent with the system's restraint against overbuilt consent UI.
- **Generated items list:** each item is a small card — thumbnail/video-poster, a Model-tag-style provider label (§7.11, monospace, `--color-bg-muted`), and a status badge reusing three of the same semantic buckets from §7.12 rather than inventing a fourth badge style: `PENDING` (info-blue, small spinner), `READY` (primary-green), `FAILED` (danger-red, with the error text and a retry action inline). A ghost trash-icon button deletes an unused item, confirmed via the same lightweight pattern as other non-catastrophic deletes.

### 9. Responsive Behavior

| Breakpoint | Layout change |
|---|---|
| `< 640px` | Single column everywhere; nav collapses to a bottom bar with 4 primary destinations (Dashboard, Posts, Schedule, Knowledge) + overflow menu; command palette becomes the primary navigation method |
| `640–1024px` | Two-column collapses to single column for dashboard; tables switch to a stacked card layout instead of horizontal scroll |
| `> 1024px` | Full multi-column layouts as specified per page |

The tool is used primarily on desktop (writing/review workflow), but mobile is supported for quick approval/rejection of drafts and checking the schedule on the go — not for full editing.

### 10. Accessibility (WCAG 2.1 AA)

- All interactive elements reachable and operable via keyboard; tab order follows visual/logical order; no keyboard traps in dialogs or the command palette.
- Every icon-only control has an `aria-label`.
- Color is never the sole signal — status badges pair color with text/icon; the repeated-phrase warning uses an icon + text, not just a yellow highlight; the qualityScore gauge (§8) always renders its numeric value as text alongside the ring, never the ring color alone.
- Form errors are announced via `aria-live="polite"` regions, associated to their field via `aria-describedby`.
- Focus is programmatically moved to the first error on failed form submission, and to a dialog's first focusable element on open, returned to the trigger on close.
- Minimum touch target `44×44px` on any touch-capable viewport, even for `sm` buttons (achieved via padding, not visual size increase).
- `prefers-reduced-motion` disables all non-essential transitions (card hover lift, skeleton shimmer, toast slide-in becomes a fade).

### 11. Content Voice in the UI Itself

Microcopy in the product follows the same "no AI slop" discipline demanded of generated posts: no exclamation-point enthusiasm ("Awesome! Your post is ready!"), no false chattiness. Confirmations are factual ("Post approved and scheduled for Thu 9:00 AM"), errors are specific ("The Writing stage failed: model returned an empty response after 2 retries"), not vague ("Something went wrong, please try again").
