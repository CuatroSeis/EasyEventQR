---
target: EasyEventQR homepage (/)
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
p2_count: 2
p3_count: 1
target_identity: "file:/home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR/src/app/pages/Home.tsx"
target_fingerprint: "sha256:8db5948fea107dc63a56f6e168996677c9a71b2fc8280106bd6e80cceea29d49"
target_path: /home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR/src/app/pages/Home.tsx
timestamp: 2026-11-17T15-58-13Z
slug: src-app-pages-home-tsx
closed: true
---
# /impeccable critique — EasyEventQR homepage (`/`)

**Target:** `src/app/pages/Home.tsx` (mounted at `/`, Persuade surface — landing page, Spanish UI)

---

## Report header provenance

⚠️ DEGRADED: single-context (sub-agents dispatched but results not available in-session; Assessment A composed from direct source review of `Home.tsx`, `App.tsx`, `index.css`, `index.html` and README; Assessment B from direct `impeccable detect --json` CLI run plus documented browser-step skips)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading spinner shown during search, but no results-count confirmation or progress for multi-step flows |
| 2 | Match System / Real World | 3 | Spanish UI with plain terms, but "código corto" is unexplained jargon users must guess |
| 3 | User Control and Freedom | 3 | Language/theme toggles and back navigation exist, but no prominent "start over" or undo after a search |
| 4 | Consistency and Standards | 3 | Consistent Tailwind + theming variables + 44px touch target, but hero CTAs compete visually |
| 5 | Error Prevention | 2 | Submit disabled when empty/loading, but no pre-submit validation hints or suggestions on no-results |
| 6 | Recognition Rather Than Recall | 3 | Example code "FEST-8K2P" shown, but users must still recall the code format; no recent-search memory |
| 7 | Flexibility and Efficiency | n/a | Landing page (Persuade) — no keyboard-shortcut expectation |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and themed, but tagline pill + H1 + bajada + two CTAs all fight for attention |
| 9 | Error Recovery | 2 | Generic "Error buscando el evento" / "Error de red" messages with no recovery suggestion or retry affordance |
| 10 | Help and Documentation | n/a | Landing page (Persuade) — no help/docs expectation |
| **Total** | | **22/32** | **Acceptable** (68.75%, just below Good) |

Applicable maximum: 8 scored heuristics × 4 = **/32** (heuristics 7 and 10 are `n/a` on a Persuade surface). Rating bands: 90%+ Excellent, 70%+ Good, 50%+ Acceptable. 68.75% lands in Acceptable, just under Good.

---

## Design Specificity Verdict

**Does it feel authored for EasyEventQR, or category-interchangeable?**

Largely category-interchangeable. The composition — hero with tagline pill, bold H1, bajada, two CTAs; a 3-step "Cómo funciona" grid; two "Para quién" cards; a search form — is a generic SaaS/landing-page kit that an unrelated product could use unchanged. The Bebas Neue display font and the CSS-variable theming pattern (genuine product strength) hint at event branding, but nothing in the layout says "event tickets," "QR at the door," or "organizer on mobile." Missed opportunities for product character: no event/QR imagery, no organizer photo, no social proof (events hosted, tickets sold), no urgency or scarcity, no door-scanner context. The theming engine is the one truly product-specific piece; the visual world sitting on top of it is not yet.

---

## Overall Impression

A clean, mobile-first landing that respects its users (44px touch targets, safe-area notches, 16px anti-zoom inputs, disabled-during-load states). It works, but it doesn't persuade. The single biggest opportunity: the hero asks the visitor to do two different things at once (create an event OR search for one) with no clear primary action, and a failed search is a dead end. Fix the hierarchy and the no-results recovery, and the page shifts from "acceptable" to "good."

---

## What's Working

1. **Mobile-first DNA is genuine, not cosmetic.** `viewport-fit=cover`, `env(safe-area-inset-*)` padding, `--touch-min: 44px`, and 16px font on inputs (prevents iOS focus zoom) show real care for the organizer-scanning-at-the-door use case.
2. **The theming pattern is architecturally strong.** The `--c-*` → `--color-*` indirection lets any event rebrand the same component with zero JS bundle changes; the same bytes produce different aspects. That's product-specific craft.
3. **Async search handling is thoughtful.** Submit disables while loading, a `⏳` spinner shows, `role="alert"` surfaces errors, and an example code hint ("FEST-8K2P") reduces recall load.

---

## Priority Issues

**[P1] Hero has two competing CTAs plus idioma/tema toggles → no clear primary action.**
- Why it matters: Visitors land and must choose between "Crear evento" (outline) and "Buscar por código" (filled) with equal visual weight, plus two toggles above. Decision paralysis dilutes the core conversion (find/validate an event).
- Fix: Make search the single primary hero CTA (filled, prominent), demote "Crear evento" to secondary, and move the idioma/tema toggles out of the hero eye-path (or into a compact row with less emphasis).
- Suggested command: `/impeccable layout`

**[P1] No-results state is a dead end.**
- Why it matters: Searching and getting "No se encontraron eventos" offers no next step — no featured events, no "create your own event" link, no refined search. Visitors abandon.
- Fix: On empty results, show recovery options: browse featured/popular events, create an event (link to `/entrar`), and a "refine your search" prompt. Never leave a searcher stranded.
- Suggested command: `/impeccable clarify` (or `/impeccable onboard` for the create-event path)

**[P2] "Código corto" is unexplained jargon; users must recall the format.**
- Why it matters: The placeholder and help text assume the visitor already knows what an event code looks like. First-timers (Jordan) won't know what to type.
- Fix: Relabel to plain language ("Código del evento"), add an inline format hint near the input, and remember the last search so returning visitors don't re-type.
- Suggested command: `/impeccable clarify`

**[P2] Error recovery is weak: generic messages, no retry affordance.**
- Why it matters: "Error buscando el evento" / "Error de red" tell users something failed but not what to do next. No retry button, no preserved query.
- Fix: Plain-language, specific errors with a visible retry action that preserves the query.
- Suggested command: `/impeccable clarify`

**[P3] No trust signals on a Persuade landing page.**
- Why it matters: Asking a visitor to hand over an event (and later money) with zero social proof — no event count, no organizer count, no testimonials, no "X tickets sold" — weakens conversion.
- Fix: Add organizer/event counts, testimonials, or a "entradas vendidas" counter near the hero.
- Suggested command: `/impeccable bolder`

---

## Persona Red Flags

**Jordan (Confused First-Timer)** — landing page / search
- Primary action: find an event by code or name.
- Red flags: "código corto" is never defined — Jordan doesn't know what to type; the example "FEST-8K2P" is the only clue and sits in small footer text; no help text beside the input; after submitting, there's no confirmation the search is underway beyond the emoji spinner; a failed search gives no guidance. Jordan abandons at step 2.

**Riley (Deliberate Stress Tester)** — landing page / search
- Primary action: search with edge-case input.
- Red flags: submitting whitespace is blocked (good), but submitting special characters or very long strings hits the API with no client-side guard or feedback; refreshing mid-search loses `buscando` state and the query (no persistence); the no-results state shows nothing useful ("No se encontraron eventos" with no guidance). Riley finds features that appear to work but silently produce dead ends.

**Casey (Distracted Mobile User)** — landing page / search
- Primary action: find an event one-handed, possibly interrupted.
- Red flags: the primary action (search input) requires typing — Casey prefers taps/selections; CTAs and toggles sit at the top of the screen outside the thumb zone; `autoComplete="off"` blocks useful browser history; if Casey switches apps and returns, search state is gone. No state persistence = progress lost on interruption.

---

## Minor Observations

- The `⏳` loading emoji is functional but not announced to screen readers beyond the `buscando` state; consider a polite live-region for "Buscando…".
- `autoComplete="off"` on the search input also suppresses potentially useful search-history autocomplete.
- The `Home.pie` footer text is small and low-contrast; fine legally, but adds nothing to persuasion.
- There is a `*` (`NoEncontrado`) route for malformed URLs, but the in-page no-results search doesn't route there — inconsistent failure handling.

---

## Questions to Consider

- "What if search were the only hero CTA, and 'crear evento' moved to a clearly secondary position?" Options: (a) yes, make search the single primary CTA; (b) keep both but visually demote crear; (c) split into two distinct entry points.
- "Does the landing need to sell, or just search? Should it show featured/popular events instead of an empty search form?" Options: (a) add a featured-events section above search; (b) keep search-first, add recovery on no-results; (c) show a map/calendar of nearby events.
- "What would a confident version of this look like — with QR imagery, organizer photos, real ticket counts?" Options: (a) add trust/social proof block; (b) add event/QR illustration to hero; (c) both, plus urgency messaging.

---

## Persistence bookkeeping

- Slug: `src-app-pages-home-tsx`
- First run for this target — no trend yet.
- Wrote `.impeccable/critique/src-app-pages-home-tsx.md` (full body archived for `/impeccable polish` to inherit).

---

**Ask the User**

Based on the issues found, which area should we tackle first?

1. **Hero hierarchy** — make search the single primary CTA, demote "crear evento", de-emphasize toggles (`/impeccable layout`) — addresses the top P1.
2. **No-results recovery** — add featured events / create-event link / refine-search prompt on empty search (`/impeccable clarify`) — addresses the second P1.
3. **Clarity & trust** — plain-language code label, inline format hint, specific retryable errors, trust signals (`/impeccable clarify` + `/impeccable bolder`) — addresses the P2s and P3.

Want to address everything, focus on the top 2, or pick just one? You can also mark any section as off-limits.

Re-run `/impeccable critique` after fixes to see your score improve.
