# EasyEventQR

Sistema de venta y reserva de entradas con validación por QR, multi-tenant, para
alquilarse a organizadores de eventos.

Tres actores, tres superficies distintas:

| Actor | Superficie | Criterio de diseño |
|---|---|---|
| **Cliente final** (asistente) | Landing pública + widget embebido | mobile-first, sin cuenta, sin login |
| **Organizador** (cliente que paga) | Panel privado | mobile-first: opera desde el celular, en la puerta |
| **Super-admin** (dueño de la plataforma) | Panel interno | desktop-first: es una herramienta de escritorio |

## Las 10 fases

Cada fase es un entregable que anda por sí solo. Se termina una, se muestra, y
se pasa a la siguiente.

| # | Entregable | Estado |
|---|---|---|
| 0 | Vite + React + Tailwind + Firebase, dos builds, deploy en Vercel | ✅ |
| 1 | Login con Google + reglas de seguridad multi-tenant | |
| 2 | CRUD de eventos (mobile-first) + branding del panel | |
| 3 | Registro público + theming dinámico + QR + mail | |
| 4 | `<ticket-widget>` embebible (Shadow DOM, bundle propio) | |
| 5 | Capa de pagos desacoplada (modo simulado) + webhook firmado | |
| 6 | Panel de gestión de registros + descarga de QRs en lote | |
| 7 | Escáner de QR con transacción atómica + link temporal de operador | |
| 8 | Panel de super-admin (desktop-first) | |
| 9 | Pulido de UI responsive + README + demo pública | |

## Arquitectura

Costo total del MVP: **$0, sin tarjeta de crédito en ningún proveedor.**

```
Frontend    Vite + React + Tailwind          →  Vercel Hobby (gratis)
Backend     Vercel Functions en /api/        →  Admin SDK de Firebase
Datos       Firestore (plan Spark)            →  1 GiB · 50k lecturas/día
Auth        Firebase Auth (Google + anónimo)  →  gratis
Mail        Brevo API                         →  300 mails/día
```

Dos builds desde un solo repo:

- `vite.config.ts` → `dist/` — panel + landing.
- `vite.widget.config.ts` → `public/widget/widget.js` → `dist/widget/widget.js` —
  el Web Component. **IIFE**, no ESM, para que un `<script src>` cross-origin
  funcione sin CORS.

`src/shared/` lo importan los dos builds: una sola lógica de negocio, dos
empaquetados.

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completalo con tu config de Firebase
npm run dev               # http://localhost:5173
```

### Variables de entorno

> **Sólo las variables con prefijo `VITE_` llegan al bundle del navegador.**
> Cualquier otra se queda en el servidor. Si creás una variable con prefijo
> `VITE_`, asumí que queda publicada en Internet.

En `.env` (desarrollo, nunca se sube): las cuatro `VITE_FIREBASE_*`.

En Vercel (`Settings → Environment Variables`):

| Variable | Para qué | ¿Secreta? |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Admin SDK en `/api/` | **Sí** |
| `BREVO_API_KEY` | envío de mail | **Sí** |
| `BREVO_SENDER_EMAIL` | remitente (tiene que estar verificado en Brevo) | No |
| `MERCADOPAGO_*` | Fase 5, vacío en el MVP | **Sí** |

Para el service account: descargalo de la consola de Firebase y pasalo por el
script, que lo aplana a una línea para que no se rompa al pegarlo:

```bash
node scripts/preparar-service-account.mjs ~/Descargas/proyecto.json
node scripts/preparar-service-account.mjs ~/Descargas/proyecto.json --write  # a .env.local
```

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en `:5173`. **No ejecuta `/api/`** |
| `npm run dev:api` | `vercel dev`: app + functions en un solo proceso |
| `npm run build` | Widget primero, después la app (así el widget entra en `dist/`) |
| `npm run typecheck` | `tsc -b` sobre `src/`, `api/` y las configs |
| `npm run lint` | oxlint |

Para probar el backend en local hace falta `vercel dev` (o desplegar): Vite no
sabe ejecutar Vercel Functions, así que `/api/salud` devuelve el código fuente
del archivo.

## El patrón de theming

El requisito era "no clases Tailwind hardcodeadas por cliente". Se cumple con
dos familias de variables CSS:

```css
@theme {
  --color-primario: var(--c-primario); /* lo que entiende Tailwind */
}
:root {
  --c-primario: #2563eb;               /* lo que escribe el código */
}
```

```tsx
<div className="bg-primario" />   // ← la clase nunca cambia
```

```ts
aplicarTema({ colorPrimario: '#dc2626' }, elemento)
// → elemento.style.setProperty('--c-primario', '#dc2626')
```

El mismo componente, los mismos bytes de JS, aspecto distinto según el evento.
`aplicarTema` vive en `src/shared/theming.ts` y lo usan tanto la app como el
widget; además calcula solo si el texto sobre ese color va en blanco o en
oscuro (`colorDeTextoSobre`, contraste WCAG).

## Limitaciones conocidas del plan gratis

- **Vercel Hobby dice "uso personal, no comercial".** Para un portfolio o un
  MVP está bien. El día que se le cobre a un organizador real hay que migrar a
  Pro o a Cloud Functions: por eso el backend vive aislado en `api/`.
- **No hay Firebase Storage** (exige Blaze desde febrero de 2026), así que las
  imágenes se comprimen en el navegador y se guardan en documentos de Firestore
  aparte. Al migrar, es cambiar un archivo.
- **Brevo:** 300 mails/día y todos los correos llevan el pie "Sent with Brevo".
- **Firestore Spark:** sin Cloud Functions ni llamadas salientes. Por eso
  todo lo que necesite backend va por `/api/`.
