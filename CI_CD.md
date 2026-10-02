# CI/CD Setup - EasyEventQR

## Workflows

### `.github/workflows/ci.yml`
Pipeline completo que corre en cada push y PR:

1. **TypeCheck** - `npm run typecheck` (tsc -b)
2. **Lint** - `npm run lint` (oxlint)
3. **Unit Tests** - `npm run test:unit` (155 tests)
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

## Quién despliega: SÓLO GitHub Actions

El deploy lo hace el workflow, no Vercel. Eso significa que **la integración
Git de Vercel tiene que estar apagada**, porque si está prendida Vercel
también construye en cada push a `main` y los dos deploys se pisan.

Apagarla es un paso manual, en el dashboard:

```
Vercel → easyeventqr → Settings → Git
  → "Ignored Build Step" o desconectar el repositorio
```

Si tu plan no permite desconectar del todo, la forma equivalente de que
Vercel no construya sola es poner un ignored build step que siempre
devuelva nada:

```bash
exit 0
```

Mientras tanto, como el deploy pasa por la CLI (`vercel deploy`),
el repositorio **no** necesita estar conectado a Vercel para que
funcione: alcanza con `VERCEL_TOKEN`, `VERCEL_ORG_ID` y
`VERCEL_PROJECT_ID`.

### Por qué se despliega la raíz y no `dist/`

`vercel deploy dist/` sube sólo la carpeta de build. El sitio subía y cada
`/api/*` daba 404, porque las funciones de `api/` nunca viajaban. Con `.`,
Vercel corre su propio `npm run build` (definido en `vercel.json`) y sube
las funciones junto.

Por eso el job **no** baja el artifact `dist`: acá Vercel recompila. El job
de build sigue en el pipeline como puerta, para que si falla el typecheck o
los tests, `needs: build` no deje llegar al deploy.

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
   OPERADOR_SECRET=...      # 32+ chars. Sin esto, /api/operador da 500.
   APP_URL=https://easyeventqr.vercel.app

   # Sólo mientras se demuestra el flujo de pagos. Ver .env.example:
   # con la simulación prendida en producción, cualquiera con el link de
   # una reserva puede marcarse su propia entrada como pagada.
   MERCADOPAGO_SIMULADO=no
   ```

### La más fácil de olvidar: `OPERADOR_SECRET`

El módulo `api/operador.ts` **falla al importar** si `OPERADOR_SECRET` no
está o mide menos de 32 caracteres. Es deliberado: antes tenía un valor por
defecto hardcodeado en el repo, así que en cualquier entorno donde faltara
la variable los links de operador se firmaban con un secreto público y
cualquiera podía fabricar el JWT de un evento ajeno.

El síntoma de que falta es un 500 en `/api/operador/link`, no un 401.

### `SUPER_ADMIN_UID` y el custom claim

El panel super-admin acepta las dos vías: el claim `admin == true` (que es
lo que miran las reglas de Firestore) o el UID igual a `SUPER_ADMIN_UID`.
Las reglas no pueden leer variables de entorno, así que el claim es el
único mecanismo que ambos lados comparten; `SUPER_ADMIN_UID` queda de
respaldo.

Para dar de alta un admin por claim: `npm run auth:admin -- email@ejemplo.com`.
Ojo: el claim viaja en el token, así que **no sirve hasta que se inicia
sesión de nuevo**.

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