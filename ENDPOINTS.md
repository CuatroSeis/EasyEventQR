# Endpoints y cómo probarlos desde la UI

Todos los endpoints que la app llama, con la pantalla que los dispara y cómo
llegar a esa pantalla. Sirve para probar de punta a punta sin `curl`.

Leyenda de auth:

- **ninguna**: abierto. Ojo, "abierto" no siempre es correcto para el
  contenido: ver la columna de notas.
- **Bearer**: ID token de Firebase. Lo manda el cliente con
  `Authorization: Bearer …`.
- **token QR**: el token del mail del asistente. Es la credencial.
- **JWT operador**: el de `/operador/:token`.

---

## 1. Visitante, sin sesión

### `/api/evento-publico?id=<eventoId>` · GET · sin auth

**UI:** `/e/<eventoId>` (landing pública, la que se comparte por WhatsApp)

Devuelve nombre, fecha, lugar, capacidad, colors y el estado de inscripción.
Sin auth a propósito: es la landing del evento.

Ojo: la capacidad publicada no debe revelar cuántos reserved hay.

**Cómo probar:** creá un evento en `/panel/eventos/nuevo`, abrilo y copiá la
URL. Es la primera pantalla que ve el invitado.

### `/api/registro` · POST · sin auth

**UI:** `/e/<eventoId>` → formulario de inscripción

Body: `{ eventoId, nombre, email, dni, fechaNacimiento, telefono }`

Crea la reserva, genera el token del QR, manda el mail y descuenta cupo.
**No hay auth y no debe haberla**: es un formulario público. El spam se
frena con el rate limit y con el cupo, no con un login.

Respuestas que vale la pena ver: `agotado`, `cerrado`, `suspendido`,
`no-existe` — están en `api/registro.ts:378`.

**Cómo probar:** inscribite con DNI y fecha de nacimiento (obligatorios), y
reintentá con el mismo email para ver el duplicate.

### `/api/pagos` (crea preferencia) · POST · **flag de simulación**

**UI:** `/e/<eventoId>` → inscribirse en un evento **pago**

Si el evento tiene `precioEntrada`, la inscripción devuelve una URL y el
frontend la abre. Con `MERCADOPAGO_SIMULADO=true` esa URL es
`/pago/simulado`.

**Devuelve 501 si el flag está apagado.** Es deliberado: este proyecto no
tiene el SDK de Mercado Pago, y fingir que sí sería peor que negarse.

### `/api/pagos/resumen?registroId=…` · GET · flag de simulación

**UI:** `/pago/simulado`

Lo que muestra la pantalla antes de "pagar": evento, fecha, lugar, importe,
estado del pago.

No devuelve nombre ni email del asistente a propósito: no hay auth en esta
ruta y el `registroId` es adivinable.

### `/api/pagos/webhook?…` · POST · flag de simulación

**UI:** los dos botones de `/pago/simulado`

Query: `preference_id`, `payment_id`, `external_reference` (= `registroId`),
`status` (`approved` | `rejected`).

Es el equivalente al webhook que manda MP. **Con la simulación prendida,
cualquiera que tenga el link de una reserva puede marcarse su propia entrada
como pagada.** Por eso el flag está apagado por defecto y hay que prenderlo a
propósito, sólo para probar.

Si además hay `MERCADOPAGO_WEBHOOK_SECRET`, un request sin firma válida
recibe 401.

### `/api/pagos/estado?registroId=…` · GET · sin auth

**UI:** `/pago/exito` → polling cada 3 s

Sólo devuelve el estado del pago. Antes `verificarEstadoPago()` pedía
`/api/registros/<id>`, una ruta que nunca existió: la pantalla de pago
confirmado arrancaba en error y se quedaba ahí.

### `/api/validar?t=<token>&eventoId=…` · GET · token QR

**UI:** `/q/<token>` (lo que escanea el asistente con la cámara)

Sólo lectura: dice si el código existe, es de este evento y está aprobado.

### `/api/validar` · POST · token QR

**UI:** `/operador/:token` → escáner de la puerta

Marca la entrada como usada, en transacción, con `fechaUso`.

**Este endpoint estaba roto al 100%**: buscaba `doc(token)` con el token en
claro, pero el documento se llama por su SHA-256. Toda entrada daba "Código
no válido". El `GET` de arriba sí hasheaba, y por eso el bug no lo mostraba
ningún test. Hay un bloque en `tests/unit/qr.test.ts` que fija el contrato.

---

## 2. Organizador, con sesión

### `/api/me` · GET · Bearer

**UI:** todas las pantallas dentro de `<Protegido>`

Devuelve el perfil del organizador. Antes aceptaba un header `x-user-uid`
que mandaba el cliente, y eso no autorizaba nada: con sólo conocer el UID
del admin (público, viaja en la URL del panel) cualquiera se autopromovía.

### `/api/registros?eventoId=…` · GET · Bearer

**UI:** `/panel/eventos/<id>/registros`

Listado con búsqueda, filtros y paginación.

**Ojo:** el listado global del panel admin lee con `TOPE_LECTURA = 2000`
antes de filtrar, así que con más de 2000 registros los filtros van a
mentir.

### `/api/registros/export?eventoId=…` · GET · Bearer

**UI:** botón "Exportar CSV" en el mismo panel

### `/api/registros/recount?eventoId=…` · POST · Bearer

**UI:** botón de recount en el mismo panel

Recalcula `reservas` contra los registros reales.

### `/api/registros/resend?eventoId=…` · POST · Bearer

**UI:** la función existe en `src/services/registros.ts` pero **no está
conectada a ningún botón todavía**. Hay que probarla desde la consola del
navegador o cablearla.

**Reenviar ROTA el token, a propósito.** El token en claro no se guarda
(solo su SHA-256), así que no se puede rearmar el mismo QR: la única forma
de mandarle un código que funcione es emitir uno nuevo. El QR del mail
anterior deja de validar, y la respuesta trae `tokensRotados` para que la UI
lo diga. El update del hash va **después** del envío del mail: si se hiciera
antes y el envío fallara, el asistente se quedaba sin ninguna entrada
válida.

---

## 3. Super-admin

### `/api/admin-organizadores?accion=…` · GET / PATCH / DELETE · Bearer

**UI:** `/admin`

Un solo endpoint para las seis pantallas, por el límite de 12 funciones de
Vercel Hobby. `accion` = `organizadores`, `dashboard`, `eventos`,
`registros`, `excepciones`, `auditoria`.

Super-admin = claim `admin == true` **o** `uid === SUPER_ADMIN_UID`. Las
reglas de Firestore no pueden leer variables de entorno, así que el claim es
el único mecanismo que ambos lados comparten; el env queda de break-glass.

- `GET ?accion=organizadores` → lista de cuentas
- `PATCH ?accion=organizadores` → cambiar plan / estado de suscripción
- `DELETE ?accion=organizadores` → borra la cuenta en cascada
  (eventos, registros, documento y usuario de Auth). No se puede borrar a
  uno mismo.
- `GET ?accion=dashboard` → KPIs
- `GET ?accion=eventos` → todos los eventos
- `GET ?accion=registros` → listado global
- `PATCH ?accion=excepciones` → `limitesPersonalizacion`
- `GET ?accion=auditoria` → quién hizo qué

---

## 4. Sin UI (no hay pantalla que las dispare)

### `/api/operador/link` · POST · Bearer

Genera el link firmado del operador de puerta. **No tiene caller en el
frontend**: existe la API pero ninguna pantalla la usa. Para probarla, desde
la consola del navegador con el token del organizador.

El módulo falla al importar si `OPERADOR_SECRET` no está o mide menos de 32
caracteres. Antes tenía un valor por defecto hardcodeado en el repo: sin la
variable en el entorno, los JWT HS256 se firmaban con un secreto público.

### `/api/operador/verificar?token=…` · GET · JWT operador

**UI:** `/operador/:token` (verifica el link al abrirlo)

Valida el JWT firmado y devuelve el evento. Si está vencido o mal formado,
devuelve un mensaje y no pasa.

### `/api/salud` · GET · sin auth

Health check. No lo llama ningún componente.

---

## Recorrido de prueba completo

Con `MERCADOPAGO_SIMULADO=true`.

1. `/entrar` → iniciar sesión como organizador.
2. `/panel` → crear un evento **con precio** (necesario para el paso 7).
3. `/panel/branding` → cambiar nombre y color → **Guardar**.
   Acá va el guard `tests/unit/formularios.test.ts`: si el `<form>` no
   llama `preventDefault()`, la página se recarga y no guarda.
4. Copiar la URL `/e/<id>` y abrirla en una ventana privada (sin sesión).
5. Inscribirse con un email nuevo. Chequear que llegó el mail con el QR.
6. Abrir `/q/<token>` con el token del mail → debe decir válida.
7. `/panel/eventos/<id>/registros` → exportar CSV, recount.
8. Volver a `/e/<id>` en la ventana privada e inscribirse: debería pedir
   el pago y abrir `/pago/simulado`.
9. En `/pago/simulado` → **Simular pago aprobado** → redirige a `/pago/exito`,
   que hace polling a `/api/pagos/estado` hasta ver `pagado`.
10. Repetir con **Simular pago rechazado** → `/pago/fallo`.
11. `/operador/<jwt>` → escanear el QR del mail. Debe marcar la entrada como
    usada. **Escanearla dos veces tiene que dar "ya usado"**.
12. `/admin` (con la cuenta super-admin) → cambiar el plan de la cuenta del
    paso 1 y ver el límite en el panel.

Los pasos 11 y 3 son los que estaban rotos y los que este documento no da
por buenos sin probarlos.