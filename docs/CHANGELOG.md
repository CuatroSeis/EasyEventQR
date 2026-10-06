# CHANGELOG — EasyEventQR

Bitácora comprimida por sesión. El detalle vive en el historial de git;
acá queda qué cambió y por qué, en pocas líneas por sesión.

## 6 Oct 2026 (7ª parte) — Auditoría profunda
- Webhook: al aprobarse un pago en evento pago se rota el token y se manda
  el mail con el QR (`rotarToken()` nuevo en `src/server/lib/rotacion.ts`).
- `rotarToken()` también lo usa el reenvío: antes sólo cambiaba el campo
  `qrHash` pero la validación busca por ID, así que el QR nuevo nunca
  validaba y el viejo seguía sirviendo.
- Fix crítico: `api/validar.ts` leía el evento DESPUÉS de escribir (500 en
  prod, el emulador no lo controla). Lápida `reemplazadoPor` + mensaje 410.
- Escáner unificado en `useEscanerQr` (Operador + panel); `backfill-eventos.mjs`
  eliminado (ya no hay nada que migrar); poda de comentarios; docs
  comprimidos (este archivo + `ESTADO.md`, chau PROGRESS/SIGUIENTE).
- Gates: 208 unit · 90 rules · e2e 7/7 · build OK.

## 6 Oct 2026 (6ª parte) — QR visible + rediseño landing
- QR del mail por CID adjunto (Gmail bloquea `data:`); `/q/:token` dibuja
  el QR en canvas desde la URL.
- Landing rediseñada (skill `ui-ux-pro-max`, Google Fonts): hero, cuenta
  regresiva, precio destacado, CTA + barra sticky mobile, tarjeta del
  organizador. Botones Escanear/Registros en cada tarjeta del Panel.

## 6 Oct 2026 (5ª parte) — Mail por Gmail SMTP
- Chau Brevo/Resend: `mail.ts` con `nodemailer` (`GMAIL_USER` +
  `GMAIL_APP_PASSWORD`). Mismo contrato (nunca tira, consola sin creds).

## 6 Oct 2026 (4ª parte) — Presets + reglas a prod
- Presets Neón/Corporativo/Festival (`tema` en personalización, picker en
  EventoForm). Reglas desplegadas a prod con `firebase deploy`.

## 6 Oct 2026 (3ª parte) — Upgrade A–E
- Mercado Pago real (SDK, 3 modos), Sentry (server + cliente),
  CI con actions pineadas a SHA + job `test-e2e`.

## 6 Oct 2026 (2ª parte) — Demo + deuda
- `npm run demo:seed` (datos de ejemplo solo-emulador). Dependabot
  sin entrada duplicada.

## 6 Oct 2026 — Re-auditoría Fases 4–8
- 6 bugs (polling de pago, links `/q/<id>`, `VITE_APP_URL`, `escapeHtml`
  no-op, placeholder muerto, token pelado) + `test:e2e` (7 pasos) y
  contratos estáticos nuevos.

## Sep 2026 — MVP Fases 0–9
- Andamiaje, auth Google multi-tenant, CRUD eventos, registro público con
  QR + mail, widget embebible, pagos simulados, panel de registros,
  escáner con link de operador, panel super-admin, pulido responsive.
- Deploy: fixes `jose` ESM-only (pin v5), `getAdminAuth()` (app/no-app),
  sin alias `@server` en `api/`, tests fuera del grafo de build.
- Seguridad: fuera `x-user-uid`, `OPERADOR_SECRET` sin default público,
  `POST validar` por hash, `resend` con token real, ruta de estado de pago.
- UX: errores de permiso con causa, `/admin` fuera de `Protegido`,
  `preventDefault()` en formularios, tap targets 44px, favicon.
