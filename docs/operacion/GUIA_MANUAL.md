# Guía: lo que tenés que hacer vos

Todo lo de acá **no lo puedo hacer yo** porque requiere tu sesión en consolas
externas, o porque son datos que sólo tenés vos. Cada paso dice dónde, qué
exactamente, y cómo sabés que quedó bien.

Hacé los pasos en orden. Los marcados 🔴 **bloquean** el recorrido end-to-end.

---

## 🔴 Paso 1 — Rotar `OPERADOR_SECRET`

**Por qué:** el valor anterior estaba hardcodeado en el repo (40 caracteres
públicos en GitHub). Mientras no lo rotes, cualquiera que lo haya leído puede
fabricar el link de operador de **cualquier evento** y marcar entradas como
usadas. El backend ahora falla cerrado si la variable falta, pero si dejás el
valor viejo, la falla no te protege.

**Generar el valor nuevo:**

```bash
openssl rand -base64 48
```

Te imprime algo así: `kQ7x...==` (64 caracteres).


**Dónde ponerlo:**

1. Vercel → tu proyecto → **Settings** → **Environment Variables**
2. Borra la que ya está y creá `OPERADOR_SECRET` con el valor nuevo
3. **Marcá las tres casillas**: Production, Preview y Development
4. Guardar

**Comprobar que quedó:** abajo de la lista de variables, Vercel te muestra el
alcance. Si sólo dice "Production", el preview va a fallar con *"Falta
OPERADOR_SECRET"*.

> El valor viejo sigue en el historial de Git. Para purgarlo haría falta
> `git filter-repo` y reescribir todos los commits. Decime si lo querés y lo
> hacemos al final, con el resto quieto.

---

## Paso 2 — Integración Git de Vercel

**Decisión tomada: se deja conectada.** Antes este paso pedía desconectarla
para que el deploy fuera sólo de GitHub Actions.

Ahora están los dos caminos activos:

- **Vercel con GitHub**: cada push a `main` dispara un build.
- **GitHub Actions**: corre los checks y después `vercel deploy --prod`.

Con los dos connected, cada push produce dos builds. No rompió nada —los dos
despliegan el mismo commit y el último que termina gana—, pero se wastea tiempo
y es una fuente confusa de "no sé cuál deployé".

Si querés dejar **sólo GitHub Actions** como dueña del deploy, hay que
desconectar la integración de Vercel y dejar el workflow con `VERCEL_TOKEN`.
Es un clic: Vercel → Settings → Git → **Disconnect**.

---

## 🔴 Paso 3 — Confirmar que tu cuenta es super-admin

**Por qué:** `/admin` sólo abre para quien tenga el custom claim `admin == true`
o el UID en `SUPER_ADMIN_UID`. Si no lo tenés, entrás a `/admin` y te expulsa de
inmediato — lo vas a leer como "la app está rota".

> **Ya está hecho.** El backend responde `isAdmin: true` para
> `ivanrufinocontac@gmail.com` (verificado en producción con un ID token real).
> Andá directo al [Paso 7](#paso-7--correr-el-recorrido-end-to-end). Este paso
> queda documentado por si hay que repetirlo con otra cuenta.

**Opción A — por custom claim (recomendada).** Es el mecanismo que comparten
el backend y las reglas de Firestore.

El claim vive en **Firebase Authentication**, no en Firestore. No se puede
agregar a mano desde la consola: la consola de Firebase no tiene editor de
custom claims, y aunque `organizadores/<uid>` tenga un campo `admin: true`, eso
**no** autoriza nada — el backend nunca lee ese campo, y las reglas tampoco.

Se asigna con el script del repo:

```bash
cd /home/rufino/Desktop/IA/QR
FIREBASE_SERVICE_ACCOUNT="$(cat easyeventqr-dev-firebase-adminsdk-fbsvc-*.json | jq -c .)" \
  npm run auth:admin -- ivanrufinocontac@gmail.com
```

El service account necesita permiso **Authentication Admin** en IAM; sin eso el
script responde `auth/invalid-credential`.

**Opción B — por variable.** No tocar nada del usuario y poner el UID en Vercel:

1. Vercel → Settings → Environment Variables → `SUPER_ADMIN_UID` = el UID.
2. Redeploy.

Ya está puesta (`c4HRa54bB7XSEyOigo2fHqgTL4h1`, en Production).

> **Después de cambiar el claim hay que cerrar sesión y volver a entrar.** No es
> un detalle: el claim viaja dentro del ID token, que Firebase ya había emitido.
> El token viejo sigue sin `admin` hasta que se emite uno nuevo.

**Comprobar:** abrí `/admin`. Si ves el panel con pestañas, quedó.

**Si igual te expulsa**, el motivo ya no lo inventamos: la respuesta de
`/api/me` trae un campo `porQue`. En DevTools → Network → `me`:

| `porQue` | Significa |
|---|---|
| `sin-sesion` | No llegó un token válido. Recargá duro y volvé a entrar. |
| `falta-var` | `SUPER_ADMIN_UID` no está en el ambiente donde estás. |
| `sin-claim` | La variable existe pero con otro UID. |
| `desconocido` | El backend no envió motivo: es un bug, hay que mirar el log. |

---

## 🔴 Paso 4 — Prender la simulación de pagos

**Por qué:** sin esto el checkout devuelve **501** a propósito. El flujo de pago
no tiene paso alternate: o lo prendés para probar, o no podés llegar a
`/pago/exito`.

**Dónde:** Vercel → Settings → Environment Variables → `MERCADOPAGO_SIMULADO`
= `true` (Development y Preview; Production sólo cuando quieras testear en
producción).

> Ojo con el valor: tiene que ser el texto `true`. El código compara contra el
> string exacto, no con `Boolean()`. Si pones `false`, la simulación se prende
> igual, porque `Boolean('false')` es `true`.

**⚠️ Apagala antes de mostrar la app a cualquiera.** Con la simulación prendida,
cualquiera que tenga el link de una reserva puede marcarse su propia entrada
como pagada sin pagar.

---

## Paso 5 — Revisar las variables que ya tenías

En Vercel, confirmá que estén estas, con estos nombres exactos:

| Variable | Estado esperado |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON del service account, **en una sola línea**, sin comillas |
| `SUPER_ADMIN_UID` | Paso 3 — ya está en Production |
| `BREVO_API_KEY` | `xkeysib-…` |
| `BREVO_SENDER_EMAIL` | remitente **verificado** en Brevo |
| `BREVO_SENDER_NAME` | `EasyEventQR` |
| `OPERADOR_SECRET` | Paso 1 |
| `APP_URL` | `https://easyeventqr.vercel.app` |
| `MERCADOPAGO_SIMULADO` | Paso 4 |

`FIREBASE_PROJECT_ID` **no hace falta**: sale del `project_id` del JSON del
service account, y `/api/salud` lo reporta como `easyeventqr-dev`.

**Sobre marcar los tres ambientes:** hoy casi todas están en **Production
solamente**. Si querés que los previews funcionen, hay que marcar Preview y
Development en `SUPER_ADMIN_UID`, `OPERADOR_SECRET`, `APP_URL`, `BREVO_*` y
`MERCADOPAGO_SIMULADO`. `FIREBASE_SERVICE_ACCOUNT` ya está en Preview y
Production.

**El detalle que más se escapa:** `FIREBASE_SERVICE_ACCOUNT` tiene que ser el
JSON entero en **una línea**. Si tiene saltos de línea, Vercel lo guarda pero
`JSON.parse` explota y todas las funciones devuelven 500.

---

## Paso 6 — Verificar que llega el mail

**Por qué:** el QR viaja **sólo por mail**. Si Brevo no está configurado o el
remitente no está verificado, la inscripción "funciona" pero el asistente nunca
recibe su entrada. Es el eslabón más silencioso de la cadena.

**Cómo probarlo sin gastar el evento:**

1. Creá un evento de prueba en `/panel/eventos/nuevo`
2. Abrilo y inscribite con **un email al que tengas acceso**
3. Revisá la bandeja, y también **spam / promotions**
4. ¿Llegó? Abrí el link `/q/...` del mail: tiene que decir válida

**Si no llega:**

- Brevo Console → verifiqué que el remitente esté en la pestaña **Senders**
- Mirá el log de la función en Vercel: el log dice `[mail] error: …`
- Verificá que `BREVO_SENDER_EMAIL` sea **exactamente** el remitente
  verificado, con el mismo dominio

---

## 🔴 Paso 7 — Correr el recorrido end-to-end

Con todo lo anterior listo, seguí `../arquitectura/ENDPOINTS.md`, sección **"Recorrido de
prueba completo"** (12 pasos).

Los que importan más, porque son los que estaban rotos y los acabamos de
arreglar:

| Paso | Qué probar | Por qué |
|---|---|---|
| 3 | Guardar branding | El `preventDefault()` falta hacía que la página se recargara sin guardar |
| 7 | Panel de registros | Estaba dando **401**: el `fetch` no mandaba `Authorization` |
| 9 | Aprobar pago | El webhook y el polling nunca se habían probado juntos |
| 11 | Escanear en la puerta | El `POST /api/validar` buscaba el token sin hashear: fallaba siempre |

En el paso 7, si ves un error de sesión en vez de la lista de registros,
decímelo: significaría que quedó algún `fetch` sin token.

En el paso 11: escaneá **dos veces**. La segunda tiene que decir *"ya usado"*.
Eso es lo que distingue un control de entradas real de una app que sólo pinta
un cartel.

---

## Paso 8 — Deploy

Sólo cuando los pasos anteriores pasen.

1. `git add -A && git commit` — hay **muchos archivos sin trackear**
2. Push a `main`
3. GitHub Actions corre solo: typecheck → lint → tests → build → deploy
4. Mirá el run en la pestaña **Actions**

**Si el deploy falla en `test-rules`:** es el emulador de Firestore. El log lo
dice; el fix histórico fue sacar `cache: 'gradle'` de `setup-java`, porque el
repo no tiene Gradle y ese cache abortaba el job.

---

## Resumen para marcar

```
[x] 3. Claim admin en tu cuenta  ivanrufinocontac@gmail.com   ← ya andaba
[ ] 1. Rotar OPERADOR_SECRET
[ ] 2. MERCADOPAGO_SIMULADO=true
[ ] 5. Revisar variables de Vercel
[ ] 6. Confirmar que llega el mail
[ ] 7. Correr los 12 pasos de ENDPOINTS.md
[ ] —  Rotar el service account (clave filtrada en el chat)
[ ] —  Apagar la simulación antes de compartir la app
```

El paso 2 de la versión anterior ("apagar la integración Git de Vercel") ya no
aplica: se reconectó Vercel con GitHub a propósito, para que los pushes a
`main` despleguen.