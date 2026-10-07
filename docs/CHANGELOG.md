# CHANGELOG — EasyEventQR

Bitácora comprimida por sesión. El detalle vive en el historial de git;
acá queda qué cambió y por qué, en pocas líneas por sesión.

## Sesión actual — Plantillas por categoría + banner blur
- `Evento.categoria` (`space-around` | `energy-earth` | `trigger-ocean` |
  null) con tabla curada en `src/shared/categorias.ts`: al crear se
  escriben colores y bienvenida sugeridos (custom manda; colores sólo si
  el plan deja customizar). Valores, no un modo: después se edita libre.
- Selector en `EventoForm`, badge en la landing, whitelist en
  `api/evento-publico`, i18n `cat.*` + `ef.categoria*`. Sin cambio de
  reglas ni migración (viejos = `null`).
- Banner como fondo fijo con blur(32px) + overlay a superficie; el
  contenido la recorre con el scroll. Sin banner: degradado actual.

## Sesión actual — Presets eliminados
- Fuera `tema`/`TemaPreset`/`PRESETS`/`resolverColores`: modelo, alta,
  edición, lectura, picker y tests. `aplicarTema` vuelve a primario/
  secundario (+sobre-primario); el modo claro/oscuro de la app no se toca.
- `scripts/limpiar-tema.mjs` (+ `npm run limpiar:tema`): borra el campo
  en documentos viejos (dry-run por defecto, `--apply` con credencial).

## Sesión actual — /admin esperaba la sesión + login auto-continúa
- Bug: `AdminPanel` leía `auth.currentUser` una sola vez al montar y
  expulsaba a `/panel` si Auth aún no restauraba (redirect mobile,
  /admin directo). Ahora espera con `esperarSesion()` (nuevo
  `src/services/sesion.ts`, sin imports runtime de Firebase) + timeout 8s.
- Login: al volver del redirect con sesión, navega solo a destino.
- Tests `sesion.test.ts` (3 casos con observador falso). Imports `.ts`
  explícitos en `auth.ts`/`firebase.ts` para `node --test`.

## Sesión actual — Tema oscuro + i18n + 2 bugs
- Bug CTA duplicado en mobile: botón en flujo solo desktop (`hidden
  sm:block`), barra fija solo mobile.
- Bug login Brave mobile: `signInWithPopup` se cuelga sin popup/cookies;
  en mobile va por `signInWithRedirect` + `consumirRedirect()` al volver,
  con mensajes para `popup-blocked`/`unauthorized-domain`.
- Tema claro/oscuro: vars `[data-theme='oscuro']`, default del sistema,
  toggle con SVG en panel y home, antiflicker inline en `index.html`;
  customs de eventos siguen por encima. Tests puros en `tema-idioma`.
- i18n Es/En: diccionario tipado (`src/shared/i18n.ts`), default del
  navegador, toggle persistido, pantallas migradas (Home, Login, panel,
  registros, escáner, cuenta, marca, eventos, admin, pagos, widget).

## Sesión actual — Deploy único + onboarding
- CI: fuera los jobs de deploy de Actions; dueña única Vercel Git.
  `VERCEL_*` a borrar de Secrets. Docs (CI_CD, GUIA_MANUAL, ESTADO) al día.
- Cuenta y Marca unificadas en `/panel/cuenta` (Perfil · Marca y landing ·
  Logo · Seguridad · Peligro); `/panel/branding` redirige; nombre vive
  solo en Perfil.
- Home como landing explicativa: hero + 3 pasos + dos públicos + buscador.

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
