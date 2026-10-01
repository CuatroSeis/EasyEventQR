# SPEC.md — EasyEventQR

## 1. Product Overview

**EasyEventQR** — Plataforma SaaS para gestión de eventos con registro público, QR y mail.

**Core Value**: Organizador crea evento → Comparte link `/e/{id}` → Invitado reserva (DNI + fecha nac) → Recibe QR por mail → Valida en puerta `/q/{token}`.

**Target**: Organizadores de eventos (cenas, cursos, conciertos) que necesitan venta/registro sin fricción.

**Stack**: Vite + React 19 + Tailwind v4 + Firebase (Auth, Firestore, Admin SDK) + Vercel (Functions) + Brevo (Mail)

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (SPA)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Landing   │  │    Panel    │  │   Admin     │             │
│  │   Pública   │  │ Organizador │  │  (Super)    │             │
│  │  /e/:id     │  │  /panel/*   │  │  /admin     │             │
│  │  /q/:token  │  │             │  │             │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────│────────────────│────────────────│────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VERCEL FUNCTIONS (/api/*)                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ evento-pub │ │  registro  │ │  validar-qr│ │    me      │   │
│  │  -publico  │ │            │ │            │ │            │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│  ┌────────────┐ ┌────────────┐                                 │
│  │   salud    │ │admin-orgs  │                                 │
│  └────────────┘ └────────────┘                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FIRESTORE (Admin SDK)                    │
│  /organizadores/{uid}  /eventos/{id}  /registros/{qrHash}       │
│  /rateLimit/{ipHash}                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model (Fuente de verdad: `src/shared/types.ts`)

### Organizador
```typescript
interface Organizador {
  nombre: string
  email: string
  uid: string
  fechaAlta: Date
  plan: 'gratis' | 'pro' | 'pro+'
  estadoSuscripcion: 'activo' | 'suspendido'
  brandingPanel: { logoUrl, colorPrimario, colorSecundario }
  limitesPersonalizacion: {
    bannerPermitido: boolean
    colorPersonalizadoPermitido: boolean
    logoPermitido: boolean
    capacidadMaximaPorEvento: number
  }
}
```

### Evento
```typescript
interface Evento {
  organizadorId: string
  nombre: string
  fecha: Date
  lugar: string
  descripcion: string
  capacidadMaxima: number
  reservas: number          // contador atómico (solo server)
  estado: 'activo' | 'cerrado'
  requierePago: boolean
  precioEntrada: number | null
  personalizacion: {
    bannerUrl: string | null
    logoUrl: string | null
    colorPrimario: string | null
    colorSecundario: string | null
    textoBienvenida: string | null
    textoConfirmacion: string | null
  }
}
```

### Registro (Público)
```typescript
interface Registro {
  eventoId: string
  nombre: string
  email: string
  telefono: string
  dni: string               // 7-8 dígitos, obligatorio
  fechaNacimiento: string   // YYYY-MM-DD, obligatorio, ≥18 años
  qrHash: string            // SHA-256(token), ID del doc
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  pago: Pago
  usado: boolean
  fechaRegistro: Date
  fechaUso: Date | null
  ipHash: string
}
```

---

## 4. Endpoints API

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/salud` | — | Health check (Firebase Admin + Firestore) |
| GET | `/api/evento-publico?id=<id>` | — | Datos landing pública |
| POST | `/api/registro` | — | Crea reserva + envía mail (transacción atómica) |
| GET | `/api/validar-qr?t=<token>&eventoId=<id>` | — | Valida QR en puerta |
| GET | `/api/me` | Firebase ID Token | Info usuario actual + `isAdmin` |
| GET | `/api/admin-organizadores` | Super-admin | Lista organizadores |
| PATCH | `/api/admin-organizadores?uid=<uid>` | Super-admin | Cambia plan organizador |

---

## 5. Flujo Crítico (Happy Path)

```
1. Super-admin loguea → /admin → ve organizadores → asigna plan
2. Organizador loguea → /panel → crea evento con bannerUrl
3. Organizador copia link `/e/{eventoId}` → comparte
4. Invitado abre link → ve landing con banner, formulario
5. Invitado llena: nombre, email, DNI, fecha nacimiento (≥18)
6. POST /api/registro → transacción:
   - Crea /registros/{qrHash} con dni, fechaNacimiento
   - Incrementa evento.reservas++
7. Reserva OK → mail Brevo con QR (token en URL)
8. Invitado recibe mail → abre /q/{token} → "Entrada válida"
9. En puerta: escanean QR → mismo /q/{token} → valida
```

---

## 6. Reglas de Seguridad (Firestore)

- **Aislamiento multi-tenant**: Organizador solo ve/escribe sus eventos (`organizadorId == request.auth.uid`)
- **Contador atómico**: `reservas` solo incrementa via Admin SDK en transacción
- **Super-admin**: Claim `admin` permite cruzar aislamiento
- **Planes**: Límites en `organizadores/{uid}.limitesPersonalizacion` (no en reglas)
- **Rate limit**: Colección `rateLimit/{ipHash}` con ventanas 1min/1h/1d

---

## 7. Fases Pendientes (Roadmap)

| Fase | Descripción | Estado |
|------|-------------|--------|
| 4 | Widget embebible `<ticket-widget>` (Shadow DOM + IIFE) | 📋 Planificada |
| 5 | Pagos (Mercado Pago) + webhook firmado | 📋 Planificada |
| 6 | Panel registros + export CSV + reenvío mail + reconteo | 📋 Planificada |
| 7 | Escáner QR + link temporal operador (transacción atómica) | 📋 Planificada |
| 8 | Panel Super-admin (desktop) | ✅ Hecho (básico) |
| 9 | Pulido responsive + README + demo pública | 📋 Planificada |

---

## 8. Criterios de Calidad (Definition of Done)

- [ ] TypeScript strict (`tsc -b` sin errores)
- [ ] Lint limpio (`oxlint` sin warnings críticos)
- [ ] Tests: 123 unitarios + 89 reglas = 212 passing
- [ ] Build produce `dist/` + `dist/widget/widget.js`
- [ ] Deploy Preview + Production en Vercel OK
- [ ] Flujo E2E manual verificado (crear → reservar → mail → QR → validar)

---

## 9. MCPs Recomendados

### Core (Proyecto)
| MCP | Propósito | Config |
|-----|-----------|--------|
| **Firebase** | Admin SDK, Auth, Firestore, Emulators | `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT` |
| **Vercel** | Deploy, Functions, Env Vars, Logs | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| **Brevo** | Mail API, Sender management | `BREVO_API_KEY` |
| **GitHub** | Issues, PRs, Actions, Releases | `GITHUB_TOKEN` |

### Development
| MCP | Propósito |
|-----|-----------|
| **Playwright** | E2E testing (flujo público + panel) |
| **Storybook** | Component library documentation |
| **Chromatic** | Visual regression testing |

### Security
| MCP | Propósito |
|-----|-----------|
| **Semgrep** | SAST en CI (reglas OWASP) |
| **Trivy** | Dependency scanning + secrets |
| **Snyk** / **Dependabot** | Vulnerability alerts |

### Observability
| MCP | Propósito |
|-----|-----------|
| **Sentry** | Error tracking (client + server) |
| **Logtail** / **Better Stack** | Logs estructurados Vercel |
| **PostHog** | Analytics (eventos, funnel registro) |

---

## 10. Sub-Agents (Responsabilidades)

| Agente | Scope | Entregables |
|--------|-------|-------------|
| **agent-auth** | Firebase Auth, Claims, Super-admin logic | `api/me.ts`, reglas claim `admin` |
| **agent-eventos** | CRUD eventos, branding, banner | `EventoForm.tsx`, `documentoEvento.ts`, `eventos.ts` |
| **agent-publico** | Landing `/e/:id`, registro, QR validation | `EventoPublico.tsx`, `QrPublico.tsx`, `api/registro.ts`, `api/validar-qr.ts` |
| **agent-admin** | Panel Super-admin, gestión planes | `AdminPanel.tsx`, `api/admin-organizadores.ts` |
| **agent-widget** | Fase 4: Web Component embebible | `vite.widget.config.ts`, `dist/widget/widget.js` |
| **agent-pagos** | Fase 5: Mercado Pago + webhooks | `api/pagos/`, webhook verification |
| **agent-registros** | Fase 6: Panel registros, CSV, reconteo | UI panel + `api/registros/` |
| **agent-escanner** | Fase 7: QR scanner + link operador | Transacción atómica `usado` |
| **agent-design** | UI/UX, design system, accessibility | `ui-ux-pro-max`, `impeccable`, Tailwind tokens |
| **agent-security** | Audits, headers, rate limit, secrets | `security-audit`, CSP, Helmet, secrets scan |
| **agent-infra** | Vercel, Firebase, CI/CD, emulators | `vercel.json`, `firebase.json`, GitHub Actions |

---

## 11. Comandos Útiles

```bash
# Desarrollo
npm run dev              # Vite (puerto 5173)
npm run dev:api          # Vercel dev (puerto 3000) + proxy /api
npm run emuladores       # Firebase emulators (firestore, auth)

# Calidad
npm run typecheck        # tsc -b
npm run lint             # oxlint
npm run test:unit        # 123 tests unitarios
npm run test:rules       # 89 tests reglas Firestore
npm run test             # Todo junto

# Build
npm run build:app        # dist/
npm run build:widget     # dist/widget/widget.js
npm run build            # Ambos

# Deploy
vercel deploy --prod     # Producción
vercel deploy            # Preview
```

---

## 12. Variables de Entorno (Vercel)

```bash
# Firebase (Backend)
FIREBASE_SERVICE_ACCOUNT={...}  # JSON en una línea
FIREBASE_PROJECT_ID=easyeventqr

# Super-admin (Backend only)
SUPER_ADMIN_UID=<uid-firebase-auth>

# Brevo (Backend)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=remitente@verificado.com
BREVO_SENDER_NAME=EasyEventQR

# Frontend (VITE_ = público)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## 13. Próximos Pasos Inmediatos

1. **Configurar `SUPER_ADMIN_UID` en Vercel** → redeploy
2. **Probar flujo E2E con `vercel dev` + emuladores**
3. **Fase 4: Widget embebible** → Shadow DOM + IIFE bundle
4. **Configurar CI/CD** (GitHub Actions: typecheck + lint + test + deploy preview)