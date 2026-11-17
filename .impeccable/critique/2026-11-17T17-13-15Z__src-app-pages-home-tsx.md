---
target: EasyEventQR homepage (/)
total_score: 29
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 3
p2_count: 2
p3_count: 2
target_identity: "file:/home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR/src/app/pages/Home.tsx"
target_fingerprint: "sha256:593c3bd403238e97fed324b12ca59df41604b062b5ddb2d8a26275a134a023d2"
target_path: /home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR/src/app/pages/Home.tsx
timestamp: 2026-11-17T17-13-15Z
slug: src-app-pages-home-tsx
---
# /impeccable critique — EasyEventQR homepage (`/`) — 4ª ejecución

**Target:** `src/app/pages/Home.tsx` (mounted at `/`, Persuade surface — landing page, Spanish UI)

## Report header provenance

Method: single-context (Assessment B detector clean via CLI; Assessment A sub-agent returned full design review).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Search shows "Buscando…" but success has no confirmation — results just appear |
| 2 | Match System / Real World | 3 | `fecha` may render as raw ISO timestamp (`…toISOString()`) instead of human-readable date |
| 3 | User Control and Freedom | 3 | No way to cancel an in-flight search; no "clear/start over" |
| 4 | Consistency and Standards | 3 | Mixed `<a href="#buscar">` vs `<Link to="/entrar">` in error block |
| 5 | Error Prevention | 3 | Input lacks `aria-invalid`/`aria-describedby` binding the alert to the field |
| 6 | Recognition Rather Than Recall | 4 | Suggested events, code chips, `FEST-8K2P` placeholder — no memorization required |
| 7 | Flexibility and Efficiency | 4 | Autofocus + Enter submit + deep links `/e/:codigo` + search by name or code |
| 8 | Aesthetic and Minimalist Design | 4 | Clean, one primary action, no gratuitous decoration |
| 9 | Error Recovery | 3 | Differentiated messages + retry + escape routes, but catch-all "Error buscando el evento" is a dead end |
| 10 | Help and Documentation | n/a | Landing page (Persuade) — not applicable |
| **Total** | | **29 / 36** | **Good** (80.6%) |

Applicable maximum: 9 scored heuristics × 4 = **/36** (heuristic 10 `n/a`).

## Design Specificity Verdict

**~70% specific, 30% interchangeable chrome.** The copy, tagline ("Entradas con QR"), QR hero graphic, `FEST-8K2P` example, and Rioplatense Spanish are authored for EasyEventQR. But the layout skeleton reads as a generic directory landing once copy is stripped.

## Deterministic scan

Detector: `impeccable detect --json index.html src/app/pages/Home.tsx api/eventos/destacados.ts` → exit 0, `[]` findings, zero rules triggered. Clean.

## Visual overlays

Not available — no native browser tool, no Playwright/Puppeteer, Vite cannot run without Firebase env vars.

## Overall Impression

Solid usability surface (80.6%) dragged down by i18n wiring and the raw-date risk. The search form is genuinely built for pressure (44px touch targets, 16px anti-zoom inputs, accent-normalized matching). The remaining issues are accessibility polish and edge-case error states, not structural problems.

## What's Working

1. **Search built for pressure.** 44px touch targets, 16px input prevents iOS zoom-on-focus, disabled-state hint only after touch, accent-normalized matching, explicit loading + error states.
2. **Results confirm before commitment.** Result count + cards showing código/nombre/lugar/fecha let the attendee verify before tapping.
3. **Real data + consistent theming.** Suggested events now from live API (`/api/eventos/destacados`), not dummy data.

## Priority Issues

**[P0] Hardcoded Spanish hint bypasses `t()`.** — FIXED in this session (now uses `t('home.buscar.hintVacio')`).
**[P1] `fecha` may render as raw ISO timestamp.** Add shared `formatoFecha` helper.
**[P1] Search input not wired to errors for AT.** Add `aria-invalid`/`aria-describedby`.
**[P1] Catch-all `"Error buscando el evento"`.** Differentiate no-found vs network vs API.
**[P2] Event code chip is not copyable.** Add copy-to-clipboard.
**[P2] Footer closes journey on chrome.** Add reassurance line or demote chrome.
**[P3] `sugeridosError` has no retry.** Add "Reintentar".
**[P3] No cancel during `buscando`.** Add abort/cancel.

## Persona Red Flags

**Jordan — attendee at the door**: network error indistinguishable from "not found"; raw ISO date hard to parse at a glance.
**Riley — organizer**: support "Contacto" is personal Gmail; no clear signpost to organizer panel.
**Casey — super-admin/a11y**: search input lacks `aria-invalid`/`aria-describedby`; `buscando` not exposed via `aria-busy`.

## Minor Observations

- Dead code comment `{t('home.como.titulo')}: 3 pasos.` on line ~319.
- Mixed link primitives in error block (`<a href="#buscar">` vs `<Link to="/entrar">`).
- Disabled-submit hint appears only after `onBlur`.
- `autoComplete="off"` on search input is inert.
- Pluralization in count line correct.

## Questions to Consider

1. **Why is public support a personal Gmail address?** Options: (a) replace with `mailto:soporte@easyeventqr.com`; (b) remove link; (c) keep as-is.
2. **Should the public home inherit organizer's brand colors?** Options: (a) yes, inherit event brand; (b) no, neutral-by-design.
3. **Is urgency ("Últimos N lugares") worth adding?** Options: (a) add countdown/scarcity; (b) no, keep calm; (c) add only on evento page.

> **Trend for `src-app-pages-home-tsx` (last 3 runs):** 22/32 → 28/36 → 29/36. Denominators differ across runs — read each score with its own denominator; not a like-for-like comparison.
> Wrote `.impeccable/critique/<filename>`.
