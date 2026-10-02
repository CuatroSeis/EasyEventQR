# Próxima sesión — plan de trabajo

Estado al cierre del **2 Oct 2026**. Todo lo de acá está verificado contra
`https://easyeventqr.vercel.app` o contra el código; nada es supuesto.

> **`/admin` ya abre.** Era un bug, no configuración: dos causes encadenadas
> (orden de llamadas + `jose@6` ESM-only) que están resueltas y deployadas.
> Los pasos 1 y 2 de abajo quedaron como referencia si algún día vuelve a
> pasar. Ya podés ir directo a la [sección 3](#3-cerrar-el-mvp).

---

## 0. Dónde quedó todo

**Deploy funcionando.** CI en verde de punta a punta (TypeCheck, Lint, Unit
Tests, Firestore Rules Tests, Build, Deploy Production). Las 9 functions
responden con el código HTTP correcto:

| Endpoint | HTTP | Lectura |
|---|---|---|
| `salud` | 200 | `{"ok":true,"proyecto":"easyeventqr-dev","organizadores":1}` |
| `me` | 200 | sin token `sin-sesion`; **con token → `isAdmin: true`** |
| `evento-publico` | 404 | id inexistente → 404, correcto |
| `registros` | 400 | sin token → 400, correcto |
| `admin-organizadores` | 401 sin token, **200 con token** | dashboard con KPIs reales |
| `operador` / `registro` / `pagos` | 405 | método incorrecto → 405, correcto |

Verificado con un ID token **real**, minteado con el service account e
intercambiado por el endpoint de Firebase Auth — no con un token inventado ni
leyendo variables de entorno.

---

## 1. El bug de `/admin` (resuelto, queda de referencia)

Eran **dos bugs encadenados**, y el primero tapaba al segundo. Los dos eran
reales; sin arreglar el primero, el segundo seguía invisible.

### 1A. `getAuth()` antes de que exista el app `[DEFAULT]`

La inicialización del app de Firebase Admin es perezosa: ocurre cuando algo
pide `getDb()`. `getAuth()` sin argumentos usa el app `[DEFAULT]`, así que si
se llama antes del primer `getDb()` tira `app/no-app`.

Los handlers verifican el token dentro de un `try { … } catch {}`, y ese catch
traducía un error de inicialización a "no tenés sesión":

| Endpoint | Decía | Era |
|---|---|---|
| `/api/me` | `porQue: "sin-sesion"` | el app no existía |
| `/api/admin-organizadores` | 401 "Token inválido o expirado." | el app no existía |
| `/api/operador` | 401 "No autenticado" | el app no existía |

`api/registros.ts` zafaba de casualidad: ahí sí pasaba por `getDb()` antes.

**Fix:** `getAdminAuth()` en `src/server/lib/firebase-admin.ts`, que inicializa
antes de devolver el Auth y concentra el `import()` dinámico. Con eso el orden
deja de importar y la clase de bug desaparece en vez de cambiar de lugar.

### 1B. `jose@6` es ESM-only

Arreglado 1A, la verificación seguía muriendo. La cadena es
`firebase-admin` → `jwks-rsa` (CommonJS) → `jose`. `jwks-rsa@4` pide
`jose@^6`, que es ESM puro, y Vercel empaqueta las functions de `api/` como
CommonJS:

```
ERR_REQUIRE_ESM — require() of ES Module node_modules/jose/dist/webapi/index.js
from node_modules/jwks-rsa/src/utils.js not supported
```

Esto explica el patrón que venían mostrando los chequeos: **`salud` andaba y
todo lo demás no**, porque Firestore no necesita JWKS y la verificación de
firma sí.

**Fix:** `overrides: { "jose": "^5.10.0" }` en `package.json`. La última major
con build CommonJS; `jwks-rsa` sólo usa `importJWK` y `exportSPKI`, que
existen en v5.

### 1C. Cómo se encontró

Agregar el `console.error` con el `code` y el `message` de firebase-admin en el
`catch` de `me.ts` fue lo que lo destapó. Antes se comía la excepción; con el
log, `vercel logs` mostró el `ERR_REQUIRE_ESM` en una línea. **Un `catch {}`
mudo no es estilo: es lo que convierte un error de infraestructura en un
diagnóstico falso.**

### 1D. Si vuelve a pasar

Los cuatro handlers ahora loguean el motivo, así que `vercel logs` lo muestra
directo. Y `/api/me` sigue devolviendo `porQue`:

| `porQue` | Significa |
|---|---|
| `sin-sesion` | No llegó un token válido. Recargá duro y volvé a entrar. |
| `falta-var` | `SUPER_ADMIN_UID` no está en el ambiente donde estás. |
| `sin-claim` | La variable existe pero con otro UID. |
| `desconocido` | El backend no mandó motivo: es un bug, mirar el log. |

---

## 2. Variables de Vercel — qué está y qué falta

Estado real, verificado con `vercel env ls`:

| Variable | Ambientes | Nota |
|---|---|---|
| `SUPER_ADMIN_UID` | Production | `c4HRa54bB7XSEyOigo2fHqgTL4h1` — anda |
| `FIREBASE_SERVICE_ACCOUNT` | Preview, Production | **Development falta** |
| `OPERADOR_SECRET` | Production | rotar (filtrado en el chat) |
| `MERCADOPAGO_SIMULADO` | Production | para E2E hace falta `true` |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | Production | confirmar remitente |
| `APP_URL` | Production | |
| `VITE_FIREBASE_*` | Production, Preview | |

**`FIREBASE_PROJECT_ID` no está puesta y no hace falta**: sale del
`project_id` del JSON del service account, y `/api/salud` lo reporta bien.

Si querés que los **previews** funcionen, hay que marcar Preview y Development
en `SUPER_ADMIN_UID`, `OPERADOR_SECRET`, `APP_URL`, `BREVO_*`,
`MERCADOPAGO_SIMULADO` y `FIREBASE_SERVICE_ACCOUNT`.

### 2.1 Rotar el service account (lo más importante que queda)

**La clave privada se imprimió en el historial del chat, dos veces.**

1. Google Cloud Console → IAM & Admin → Service Accounts.
2. El service account `firebase-adminsdk-fbsvc@easyeventqr-dev.iam.gserviceaccount.com`
   → Keys → **Create new key** (JSON).
3. Vercel → Environment Variables → `FIREBASE_SERVICE_ACCOUNT` →
   reemplazar por el JSON nuevo **minificado en una línea**.
4. Google Cloud → Keys → **Delete** la clave vieja (`4a908f6d...`).
5. Borrar el JSON local: `rm easyeventqr-dev-firebase-adminsdk-fbsvc-4a908f6d1c.json`

Para minificar sin dejar el valor en el historial del shell:

```bash
jq -c . easyeventqr-dev-firebase-adminsdk-*.json > /tmp/sa.json && cat /tmp/sa.json
```

> Recordar: **JSON crudo, no base64**. El backend hace `JSON.parse(raw)`.

### 2.2 Rotar `OPERADOR_SECRET`

El valor anterior estaba hardcodeado en el repo. Con ese valor, cualquiera que
lo lea puede fabricar el link de operador de cualquier evento y marcar entradas
como usadas.

```bash
openssl rand -base64 48
```

Ponerlo en Vercel reemplazando el actual.

---

## 3. Cerrar el MVP

En este orden:

1. **Recorrer los 12 pasos** de [`../arquitectura/ENDPOINTS.md`](../arquitectura/ENDPOINTS.md).
   Es la lista de verificación del MVP y nunca se corrió completa.
2. **Mail real**: `BREVO_API_KEY` + remitente verificado. Sin esto el flujo
   anda entero pero el mail sale por consola, y el QR es lo único que separa
   "tener entrada" de "no tenerla".
3. **`OPERADOR_SECRET`**: rotar el que se pegó en el chat (32+ caracteres).
4. **`MERCADOPAGO_SIMULADO`**: queda en `true` sólo para pruebas. Apagarlo
   antes de compartir la URL. Mercado Pago real no está integrado.

---

## 4. Technical debt que quedó anotado

Ninguno bloquea el MVP. Todo verificado y anotado para no perderlo:

- **Lint: 14 warnings.** Todos `react(set-state-in-effect)` y
  `react(only-export-components)`, de código que funciona. El patrón correcto
  es derivar el valor durante el render en vez de setearlo en el effect.
- **`TOPE_LECTURA = 2000`** en el panel admin. Con más de 2000 registros la
  lista se trunca y no lo dice.
- **`/api/registros/resend` existe pero ningún botón la llama.** Probable que
  haya que cablearla en el panel de registros.
- **Dependabot duplicado** en `.github/dependabot.yml` (entradas npm
  repetidas) y actions sin pinnear por SHA.
- **Actions apuntando a Node 20 y `setup-java@v4`**, ambos deprecados por los
  runners. Son warnings, no fallos, pero hay que migrarlos.
- **OIDC sin usar**: `VERCEL_TOKEN` es un token estático que ya tuvo que
  renovarse una vez.
- **Deploy doble**: con Vercel conectado a GitHub y GitHub Actions desplegando,
  cada push a `main` construye dos veces.

---

## 5. Cómo verificar sin surprises

```bash
cd /home/rufino/Desktop/IA/QR
npm run typecheck     # tsc -b && tsc -p tsconfig.tests.json
npm run lint          # 14 warnings, exit 0
npm run test:unit     # 173 tests
npm run test:rules    # 89 tests (necesita el JRE de .tools/)
npm run build
```

Si `test:rules` dice `port taken`, hay un emulador anterior vivo:

```bash
pkill -f cloud-firestore-emulator; sleep 3
```

**Node 22.6+ es obligatorio.** Los tests importan `.ts` con la extensión
explícita y los corre el type-stripping nativo. En Node 20 no parsean.

### 5.1 Verificar auth contra producción

Los tests unitarios no cubren el empaquetado de Vercel, y dos bugs seguidos
justamente vivieron ahí. Para comprobar que la verificación de tokens funciona
de verdad en producción:

```bash
# Con FIREBASE_SERVICE_ACCOUNT local y VITE_FIREBASE_API_KEY en .env.local
vercel logs easyeventqr.vercel.app --since 5m
```

y mirar que **no** aparezca `verifyIdToken falló`. Ese log es la señal de
alerta: si el `catch` se dispara, la verificación de tokens está rota aunque
todo lo demás dé verde.