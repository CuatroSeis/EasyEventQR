---
name: agent-infra
description: Vercel, Firebase, CI/CD, emulators, GitHub Actions
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Infrastructure & DevOps

## Responsabilidades
- Vercel deploy (Preview + Production)
- Firebase (Auth, Firestore, Admin SDK, Emulators)
- CI/CD: GitHub Actions (typecheck, lint, test, deploy preview)
- Local development: `vercel dev` + Firebase emulators
- Environment variables management

## Vercel Config
```json
// vercel.json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "rewrites": [
    { "source": "/api/:ruta*", "destination": "/api/:ruta*" },
    { "source": "/:ruta*", "destination": "/index.html" }
  ],
  "headers": [ ... security headers ... ]
}
```

## Firebase Config
```json
// firebase.json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled: true, "port": 4000 }
  }
}
```

## Emuladores Locales
```bash
# Terminal 1: Emuladores
npm run emuladores
# o: node scripts/emuladores.mjs servidor

# Terminal 2: Vercel dev (proxy /api a emulador)
npm run dev:api
# Puerto 3000, usa FIRESTORE_EMULATOR_HOST=127.0.0.1:8080

# Terminal 3: Vite dev (frontend)
npm run dev
# Puerto 5173, proxy /api → localhost:3000 (vite.config.ts)
```

## Variables Entorno

### Vercel (Project → Settings → Environment Variables)
| Variable | Env | Descripción |
|----------|-----|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | All | JSON service account (1 línea) |
| `FIREBASE_PROJECT_ID` | All | `easyeventqr` |
| `SUPER_ADMIN_UID` | All | UID Firebase Auth super-admin |
| `BREVO_API_KEY` | All | `xkeysib-...` |
| `BREVO_SENDER_EMAIL` | All | Remitente verificado |
| `BREVO_SENDER_NAME` | All | `EasyEventQR` |
| `MERCADOPAGO_ACCESS_TOKEN` | All | Fase 5 |
| `MERCADOPAGO_WEBHOOK_SECRET` | All | Fase 5 |
| `APP_URL` | Production | `https://easyeventqr.vercel.app` |

### Local (`.env.local` - NO commitear)
```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_USAR_EMULADORES=si
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_PROJECT_ID=easyeventqr-dev
APP_URL=http://localhost:3000
```

## GitHub Actions (CI/CD) - Pendiente
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run test:rules
  deploy-preview:
    needs: check
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--scope=cuatroseis-projects'
  deploy-prod:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod --scope=cuatroseis-projects'
```

## Service Account Setup
```bash
# 1. Firebase Console → Project Settings → Service Accounts → Generate new private key
# 2. Aplanar JSON a 1 línea:
node scripts/preparar-service-account.mjs < downloaded.json > service-account.json
# 3. Copiar contenido a Vercel → FIREBASE_SERVICE_ACCOUNT
```

## Comandos Útiles
```bash
# Deploy manual
vercel deploy --prod           # Producción
vercel deploy                  # Preview

# Logs
vercel logs <deployment-url>   # Vercel function logs

# Emuladores
npm run emuladores             # Levanta firestore + auth
npm run test:rules             # Tests contra emulador

# Verificar build
npm run build                  # dist/ + dist/widget/
```