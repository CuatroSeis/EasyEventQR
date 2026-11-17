---
target: EasyEventQR homepage (/)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
p2_count: 3
p3_count: 2
target_identity: "file:/home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR/src/app/pages/Home.tsx"
target_fingerprint: "sha256:2e6af64b956d4ae2dc922321f77dfb6e51765173e275f4cc75b19ffa31e5717d"
target_path: /home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR/src/app/pages/Home.tsx
timestamp: 2026-11-17T17-00-00Z
slug: src-app-pages-home-tsx
---
# /impeccable critique — EasyEventQR homepage (`/`) — 3ª ejecución

**Target:** `src/app/pages/Home.tsx` (mounted at `/`, Persuade surface — landing page, Spanish UI)

## Report header provenance

Method: single-context (Assessment B detector clean via CLI; Assessment A sub-agent returned full design review).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Search status shown (spinner + `buscando`), but result scope never quantified ("X eventos encontrados" missing) |
| 2 | Match System / Real World | 3 | Rioplatense Spanish fits, but suggested events show partial dates ("15 de dic") with no year — ambiguous, quickly stale |
| 3 | User Control and Freedom | 3 | Retry + clear-error paths exist; but no dismiss for suggested block, no escape from dead end except search/retry |
| 4 | Consistency and Standards | 3 | Button/card styles consistent; but mixed navigation primitives (`<a href="#buscar">` vs `<Link to="/entrar">`) |
| 5 | Error Prevention | 3 | Submit disabled on empty/loading — but prevention is silent (disabled button, no inline hint why) |
| 6 | Recognition Rather Than Recall | 3 | "Eventos sugeridos" added, but hardcoded dummy data — recognition built on fiction |
| 7 | Flexibility and Efficiency | 3 | autoFocus + example code help; but no shortcuts, no recent searches, no autocomplete |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and airy; but hero has two competing CTAs and footer dead link (`#`) add noise |
| 9 | Error Recognition, Diagnosis, Recovery | 4 | **Strongest area.** Differentiated no-found vs connection errors, specific recovery per type, focus returned on retry |
| 10 | Help and Documentation | 1 | No help/FAQ; promised help channel (`Contacto`) is a dead `href="#"` |
| **Total** | | **29 / 40** | **Good** (72.5%) |

Applicable maximum: 10 × 4 = **/40** (no heuristics marked `n/a` this run — honest scoring).

## Design Specificity Verdict

**Category-interchangeable with EasyEventQR-specific copy.** The layout is a generic "search landing" template: hero with pill + H1 + bajada + dual CTA, search form, feature grid ("Cómo funciona"), two audience cards, footer. Nothing in the visual language signals "ticketing," "QR," or "events" beyond one decorative QR SVG icon that encodes nothing. The copy is genuinely EasyEventQR, but the visual design could be any directory/jobs board with colors swapped.

## Deterministic scan

Detector: `impeccable detect --json index.html src/app/pages/Home.tsx` → exit 0, `[]` findings, zero rules triggered. Clean.

## Visual overlays

Not available — no native browser tool, no Playwright/Puppeteer, Vite cannot run without Firebase env vars.

## Overall Impression

The page now *looks* like EasyEventQR: search-first, QR-marked, recovery-ready. It moved from "a template wearing EasyEventQR's copy" to "a landing that sells QR tickets." But two P0s remain: a dead `Contacto` link and hardcoded dummy suggested events — both undermine trust at the moment of maximum user need.

## What's Working

1. **Differentiated error recovery.** Splitting `no` (not found) vs `red` (connection) with distinct recovery actions is genuinely good UX for spotty venue networks.
2. **Mobile-first touch ergonomics.** `min-h-[56px]` inputs/buttons, 16px font (avoids iOS zoom), 44px touch minimum, safe-area padding — built for "scan at the door with one hand."
3. **Consistent, localized voice.** Rioplatense Spanish throughout; `FEST-8K2P` carried consistently from placeholder to help text.

## Priority Issues

**[P0] Dead `Contacto` link (footer).** Promises a help channel the user cannot reach. Fix: replace `href="#"` with a working link or remove it. Command: edit `Home.tsx`.

**[P0] Hardcoded dummy "Eventos sugeridos".** Fake events with fake dates on a live surface mislead users. Fix: back with real API endpoint or remove section. Command: edit `Home.tsx`.

**[P1] Two competing hero CTAs of near-equal visual weight.** "Tengo un código" vs "Crear mi evento" both `flex-1`, same height. Fix: demote "Crear mi evento" visually or move it out of hero. Command: edit `Home.tsx`.

**[P1] Mixed navigation primitives.** `<a href="#buscar">` vs `<Link to="/entrar">`. Fix: standardize primitives to intent. Command: edit `Home.tsx`.

**[P2] Silent empty-query prevention.** Button disables on empty input with no explanation. Fix: add inline hint. Command: edit `Home.tsx`.

**[P2] No result count.** Fix: add "N evento(s) encontrado(s)" above results. Command: edit `Home.tsx`.

**[P3] Footer control cluster (>4 options).** Fix: group idioma/tema or reduce footer links. Command: edit `Home.tsx`.

**[P3] Partial dates without year in suggested events.** Fix: full date or relative label. Command: edit `Home.tsx`.

## Persona Red Flags

**Jordan — attendee, mobile-first, no account, likely at the door**
- Stranded by dead `Contacto` link when event not found — no rescue path at high-stress moment.
- Wastes time on hardcoded suggested events whose dates don't match reality.
- Spotty venue network triggers `red` error; recovery exists but is the *only* option — no offline fallback.

**Riley — organizer, time-poor, the paying customer**
- The organizer's primary action ("Crear mi evento") is visually subordinated to attendee search on the only public surface they see — discoverability of their own entry point is poor.

**Casey — super-admin, desktop panel**
- Home always renders `#2563eb` blue regardless of event brand — inconsistent with the theming story in `index.css` where `--c-primario` is per-event/custom.

## Minor Observations

- Hero QR SVG is purely decorative (`aria-hidden`, encodes nothing).
- `autoComplete="off"` blocks browser history of past codes.
- Error-state layout shifts between error types (red error adds extra `<p>` line below buttons).
- `pb-12` + `gap-10` sections read as empty on short screens.

## Questions to Consider

1. **Should we fix the two P0s now (dead `Contacto` link + dummy suggested events)?** Options: (a) yes, fix both P0s immediately; (b) fix only `Contacto`, remove suggested events section; (c) defer both and close the homepage.
2. **Should "Eventos sugeridos" connect to a real API (`/api/eventos/destacados`) or be removed?** Options: (a) connect to real API; (b) remove section entirely; (c) keep static examples but mark them clearly as examples.
3. **Is there a real contact channel for the footer `Contacto` link?** Options: (a) yes, use `mailto:soporte@easyeventqr.com`; (b) no, remove the link; (c) point to the organizer panel `/entrar`.

> **Trend for `src-app-pages-home-tsx` (last 3 runs):** 22/32 → 28/36 → 29/40. Denominators differ across runs, so the line is **not** like-for-like; read each score with its own denominator.
> Wrote `.impeccable/critique/<filename>`.
