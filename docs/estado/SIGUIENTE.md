# Próxima sesión — plan de trabajo

Estado al cierre del **2 Oct 2026**. Todo lo de acá está verificado contra
`https://easyeventqr.vercel.app` o contra el código; nada es supuesto.

---

## 0. Dónde quedó todo

**Deploy funcionando.** CI en verde de punta a punta (TypeCheck, Lint, Unit
Tests, Firestore Rules Tests, Build, Deploy Production). Las 9 functions
responden con el código HTTP correcto:

| Endpoint | HTTP | Lectura |
|---|---|---|
| `salud` | 200 | `{"ok":true,"proyecto":"easyeventqr-dev","organizadores":1}` |
| `me` | 200 | `{"ok":true,"uid":null,...}` sin token, 200 con token |
| `evento-publico` | 404 | id inexistente → 404, correcto |
| `registros` | 400 | sin token → 400, correcto |
| `admin-organizadores` | 401 | sin token → 401, correcto |
| `operador` / `registro` / `pagos` | 405 | método incorrecto → 405, correcto |

**Único bloqueante abierto:** el panel `/admin` expulsa al usuario aunque esté
iniciado como `ivanrufinocontac@gmail.com`.

---

## 1. El bloqueante: por qué `/admin` expulsa

`AdminPanel.tsx` ya manda el token correctamente:

```tsx
fetch('/api/me', { headers: { Authorization: `Bearer ${await actual.getIdToken()}` } })
```

El frontend no es el problema. La respuesta de `/api/me` trae un campo
`porQue` que dice **exactamente** por qué se rechaza, y `AccesoDenegado` lo
traduce. Ese campo es la única cosa que hay que mirar.

### Paso 1 — leer el motivo (30 segundos, sin tocar nada)

1. Abrir `https://easyeventqr.vercel.app/admin` con la sesión iniciada.
2. DevTools → Network → buscar `me`.
3. Mirar el cuerpo de la respuesta. Viene uno de estos cinco:

| `porQue` | Significa | Qué hacer |
|---|---|---|
| `falta-var` | `SUPER_ADMIN_UID` no está en las variables de Vercel | → Paso 2A |
| `sin-claim` | La variable está, pero tu UID no es el de esa variable | → Paso 2B |
| `sin-sesion` | No llegó un token válido | → Paso 2C |
| `error-red` | `/api/me` no respondió | → Paso 2D |
| `desconocido` | El backend no envió un motivo | → Paso 2E |

**Este paso no es opcional.** Sin el `porQue` hay tres hipótesis Vivo y
probablemente se implementa la que no es.

### Paso 2 — actuar según el motivo

#### 2A. Si es `falta-var` (lo más probable)

Nunca se confirmó que `SUPER_ADMIN_UID` esté puesta en Vercel. En la sesión
pasada el usuario putsó `FIREBASE_SERVICE_ACCOUNT` y nada más.

- Tu UID real es **`c4HRa54bB7XSEyOigo2fHqgTL4h1`** (está en `.env.local`).
- Vercel → Settings → Environment Variables → `SUPER_ADMIN_UID` = ese valor.
- **Marcar los tres ambientes**: Production, Preview y Development. Marcando
  sólo Production, el deploy de `main` funciona pero los previews no, y eso
  confunde la próxima vez.
- Redeploy. La variable se lee **en runtime**, no al compilar: con guardar la
  variable alcanza, pero un redeploy deja el cache del serverless sin dudas.
- Volver a abrir `/admin`.

#### 2B. Si es `sin-claim`

La variable está puesta pero con otro UID, o la puesta no es la de esta
cuenta. Dos salidas, y conviene aplicar **las dos**:

1. Corregir `SUPER_ADMIN_UID` en Vercel al UID correcto.
2. Asignar el custom claim, que es la vía que no depende de ninguna variable:

```bash
cd /home/rufino/Desktop/IA/QR
FIREBASE_SERVICE_ACCOUNT="$(cat easyeventqr-dev-firebase-adminsdk-fbsvc-4a908f6d1c.json | jq -c .)" \
  npm run auth:admin -- ivanrufinocontac@gmail.com
```

El service account necesita permiso **Authentication Admin** en IAM; sin eso el
script responde `auth/invalid-credential`.

> **Después de asignar el claim hay que cerrar sesión y volver a entrar.** No es
> un detalle: el claim viaja dentro del ID token, que Firebase ya había
> emitido. El token viejo sigue sin `admin` hasta que se emite uno nuevo.

#### 2C. Si es `sin-sesion`

`/api/me` no recibió un `Authorization: Bearer` válido. En Network, revisar que
el request a `me` tenga el header. Causas probables:

- La sesión de Firebase venció. Entrar de nuevo.
- El navegador y la pestaña quedó con un token viejo en memoria: recargar duro.

#### 2D. Si es `error-red`

`/api/me` no llegó a responder. Verificar el backend con:

```bash
curl -s https://easyeventqr.vercel.app/api/salud
```

Si `salud` devuelve `ok:true` y `me` no, es específico de `me`; si ambos
caen, revisar `FIREBASE_SERVICE_ACCOUNT` en Vercel.

#### 2E. Si es `desconocido`

El backend respondió sin `porQue`. Verificar que el deploy de `/api/me` sea el
de `b323245` en adelante. Con el commit viejo el campo no existía.

---

## 2. Pendiente de seguridad — rotar el service account

**Es lo más importante que quedó sin hacer.** La clave privada del service
account `easyeventqr-dev` se imprimió en el historial del chat, dos veces.

1. Google Cloud Console → IAM & Admin → Service Accounts.
2. El service account `firebase-adminsdk-fbsvc@easyeventqr-dev.iam.gserviceaccount.com`
   → Keys → **Create new key** (JSON).
3. Vercel → Settings → Environment Variables → `FIREBASE_SERVICE_ACCOUNT` →
   reemplazar por el JSON nuevo **minificado en una línea**.
4. Google Cloud → Keys → **Delete** la clave vieja (`4a908f6d...`).
5. Borrar el JSON local: `rm easyeventqr-dev-firebase-adminsdk-fbsvc-4a908f6d1c.json`

Para minificar sin dejar el valor en el historial del shell:

```bash
jq -c . easyeventqr-dev-firebase-adminsdk-*.json > /tmp/sa.json && cat /tmp/sa.json
```

> Recordar: **JSON crudo, no base64**. El backend hace `JSON.parse(raw)`.

---

## 3. Cerrar el MVP

Una vez que `/admin` abra, en este orden:

1. **Recorrer los 12 pasos** de [`../arquitectura/ENDPOINTS.md`](../arquitectura/ENDPOINTS.md).
   Es la lista de verificación del MVP y nunca se corrió completa.
2. **Mail real**: `BREVO_API_KEY` + remitente verificado. Sin esto el flujo
   anda entero pero el mail sale por consola, y el QR es lo único que separa
   "tener entrada" de "no tenerla".
3. **`OPERADOR_SECRET`**: rotar el que se pegó en el chat y verificar que
   tenga 32+ caracteres.
4. **`MERCADOPAGO_SIMULADO`**: queda en `true` sólo para pruebas. Apagarlo
   antes de compartir la URL. Mercado Pago real no está integrado.
5. **`FIREBASE_PROJECT_ID`**: es `easyeventqr-dev`. Si esto va a producción
   con datos reales, decidir si el nombre del proyecto es sólo eso o si hay
   que separar las bases.

---

## 4. Technical debt que quedó anotado

Ninguno bloquea el MVP. Todo verificado y anotado para no perderlo:

- **Lint: 14 warnings.** Todos `react(set-state-in-effect)` y
  `react(only-export-components)`, de código que funciona. El patrón correcto
  es derivar el valor durante el render en vez de setearlo en el effect.
- **`TOPE_LECTURA = 2000`** en el panel admin. Con más de 2000 registros la
  lista se trunca y no lo dice.
- **Dependabot duplicado** en `.github/dependabot.yml` (entradas npm
  repetidas) y actions sin pinnear por SHA.
- **Actions apuntando a Node 20 y `setup-java@v4`**, ambos deprecados por los
  runners. Son warnings, no fallos, pero hay que migrarlos.
- **OIDC sin usar**: `VERCEL_TOKEN` es un token estático que ya tuvo que
  renovarse una vez. OIDC es mejor y no se puede usar mientras Git esté
  desconectado (la CLI exige la app de Vercel instalada en el repo).

---

## 5. Cómo verificar sin surprises

```bash
cd /home/rufino/Desktop/IA/QR
npm run typecheck     # tsc -b && tsc -p tsconfig.tests.json
npm run lint          # 14 warnings, exit 0
npm run test:unit     # 163 tests
npm run test:rules    # 89 tests (necesita el JRE de .tools/)
npm run build
```

Si `test:rules` dice `port taken`, hay un emulador anterior vivo:

```bash
pkill -f cloud-firestore-emulator; sleep 3
```

**Node 22.6+ es obligatorio.** Los tests importan `.ts` con la extensión
explícita y los corre el type-stripping nativo. En Node 20 no parsean.