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

## 🔴 Paso 2 — Apagar la integración Git de Vercel

**Por qué:** vos pediste que el deploy lo haga **sólo GitHub Actions**. Si Vercel
también tiene el repo conectado, cada push a `main` dispara dos builds que se
pisan, y el que gana es el que termina. En el mejor caso perdés tiempo; en el
peor, desplegás un build a medio construir.

**Dónde:**

1. Vercel → tu proyecto → **Settings** → **Git**
2. Buscá el repositorio conectado y pulsá **Disconnect** / **Desconectar**
3. Confirmá

**Comprobar que quedó:** en esa misma pantalla tiene que decir que no hay
repositorio conectado.

---

## 🔴 Paso 3 — Confirmar que tu cuenta es super-admin

**Por qué:** `/admin` sólo abre para quien tenga el custom claim `admin == true`
o el UID en `SUPER_ADMIN_UID`. Si no lo tenés, entrás a `/admin` y te expulsa de
inmediato — lo vas a leer como "la app está rota".

**Opción A — por custom claim (recomendada).** Es el mecanismo que comparten
el backend y las reglas de Firestore.

1. Firebase Console → **Authentication** → **Users**
2. Copiá el UID de `ivanrufinocontac@gmail.com`
3. Firebase Console → **Firestore** → creá/abrí el documento
   `organizadores/<ese UID>`
4. Agregá el campo:

   ```
   admin: true
   ```

5. Guardá. **Cerrá sesión y volvé a entrar**: los tokens se cachean una hora.

**Opción B — por variable.** Si preferís no tocar Firestore, dejá
`SUPER_ADMIN_UID` con ese UID en Vercel y recargá con logout/login.

**Comprobar:** abrí `/admin`. Si ves el panel con pestañas, quedó. Si te
expulsa al `/panel`, el claim no está.

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
| `FIREBASE_PROJECT_ID` | El proyecto real (no `easyeventqr-dev`) |
| `SUPER_ADMIN_UID` | Paso 3 |
| `BREVO_API_KEY` | `xkeysib-…` |
| `BREVO_SENDER_EMAIL` | remitente **verificado** en Brevo |
| `BREVO_SENDER_NAME` | `EasyEventQR` |
| `OPERADOR_SECRET` | Paso 1 |
| `APP_URL` | `https://easyeventqr.vercel.app` |
| `MERCADOPAGO_SIMULADO` | Paso 4 |

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
[ ] 1. Rotar OPERADOR_SECRET          (los 3 ambientes)
[ ] 2. Apagar integración Git de Vercel
[ ] 3. Claim admin en tu cuenta  ivanrufinocontac@gmail.com
[ ] 4. MERCADOPAGO_SIMULADO=true
[ ] 5. Revisar variables de Vercel
[ ] 6. Confirmar que llega el mail
[ ] 7. Correr los 12 pasos de ENDPOINTS.md
[ ] 8. Commit + push + deploy
[ ] —  Apagar la simulación antes de compartir la app
```