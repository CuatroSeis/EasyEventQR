# CI/CD Setup - EasyEventQR

## Workflows

### `.github/workflows/ci.yml`
Pipeline completo que corre en cada push y PR:

1. **TypeCheck** - `npm run typecheck` (tsc -b)
2. **Lint** - `npm run lint` (oxlint)
3. **Unit Tests** - `npm run test:unit` (123 tests)
4. **Rules Tests** - `npm run test:rules` (89 tests contra emulador)
5. **Build** - `npm run build` (app + widget)
6. **Deploy Preview** (solo PRs) - Deploy a Vercel Preview
7. **Deploy Production** (solo push a main) - Deploy a Vercel Production

## Secrets requeridos en GitHub

Ve a **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Descripción | Dónde conseguirlo |
|--------|-------------|-------------------|
| `VERCEL_TOKEN` | Token de Vercel para deploy | Vercel → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | ID de la organización/equipo | Vercel → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | ID del proyecto | Vercel → Project Settings → General → Project ID |

## Configuración de Vercel

1. Conecta el repo a Vercel (Import Git Repository)
2. Configura **Environment Variables** en Vercel (Project → Settings → Environment Variables):
   ```
   FIREBASE_SERVICE_ACCOUNT=...
   FIREBASE_PROJECT_ID=easyeventqr
   SUPER_ADMIN_UID=...
   BREVO_API_KEY=...
   BREVO_SENDER_EMAIL=...
   BREVO_SENDER_NAME=EasyEventQR
   MERCADOPAGO_ACCESS_TOKEN=...
   MERCADOPAGO_WEBHOOK_SECRET=...
   OPERADOR_SECRET=...
   APP_URL=https://easyeventqr.vercel.app
   ```

3. **Deploy Hook** (opcional): Vercel detecta automáticamente el framework Vite y usa `npm run build`

## Dependabot

Configurado en `.github/dependabot.yml`:
- Updates semanales (lunes 9 AM)
- Agrupa deps por categoría (dev, firebase, react, testing, security)
- Crea PRs con label `dependencies`

## Ejecución local de tests

```bash
# Todo junto
npm run test

# Por separado
npm run typecheck
npm run lint
npm run test:unit
npm run test:rules

# Build completo
npm run build
```

## Emuladores para test:rules local

```bash
# Terminal 1
npm run emuladores

# Terminal 2 (en otra pestaña)
npm run test:rules
```

## Variables de entorno para desarrollo local

Copia `.env.example` a `.env.local` y completa:

```bash
cp .env.example .env.local
```

Variables clave para `vercel dev`:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_PROJECT_ID=easyeventqr-dev
VITE_USAR_EMULADORES=si
APP_URL=http://localhost:3000
```

## Troubleshooting

### Tests de reglas fallan
- Verifica que Java 21 esté instalado
- Los tests usan emulador de Firestore en puerto 8080
- `npm run emuladores` debe estar corriendo antes de `npm run test:rules`

### Deploy falla en Vercel
- Verifica que `FIREBASE_SERVICE_ACCOUNT` esté bien formateado (JSON en una línea)
- Revisa logs en Vercel Dashboard → Deployments → View Logs

### TypeCheck falla
- Corre `npm run typecheck` localmente primero
- Verifica que no haya imports rotos o tipos incorrectos