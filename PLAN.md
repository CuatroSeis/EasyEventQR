# Plan de trabajo

Este archivo es el documento vivo del proyecto: dónde quedó cada fase, cómo se
decidió lo que se decidió, qué falta y por qué. El `README.md` explica cómo
funciona el producto; este explica cómo se llegó hasta acá y qué hay que hacer
mañana.

Cuando se termine una fase, se actualizan las dos tablas de más abajo. Si una
decisión del código no se entiende leyendo el código, se escribe acá.

## 0. Dónde quedó la última sesión

Fases 0, 1 y 2 terminadas y desplegadas. **La Fase 3 está implementada de
capa a capa** y sólo falta lo que necesita una clave de un tercero: sin
`BREVO_API_KEY` el mail sale por consola, y con la clave sale de verdad.

Lo que quedó hecho, y por qué en ese orden:

1. **Modelo y reglas primero**, antes que los endpoints. `Evento.reservas` y
   `Registro.qrHash` existen, y las reglas ya protegen el contador y la
   capacidad. Escribirlos al revés hubiera dejado una semana de endpoints
   depending de un modelo que después cambió.
2. **`api/lib/` como módulos hoja puros**: `qr.ts`, `validacion.ts`, `cupo.ts`,
   `email.ts`, `url.ts`. Puros, sin imports entre ellos, y por eso todos
   testeables sin emulador y sin red (88 tests nuevos).
3. **`api/lib/mail.ts` como el único archivo con `fetch` y con
   `process.env`**, que es lo que hace testeable el resto.
4. **Los tres endpoints**: `evento-publico.ts`, `registro.ts`, `validar-qr.ts`.
5. **Las dos páginas públicas**, `EventoPublico.tsx` y `QrPublico.tsx`, con
   `lazy()` para que el SDK de Firebase no entre en el bundle de la landing.

Lo que **queda**, en este orden:

1. Desplegar las reglas de Firestore, antes que nada. Están probadas contra
   el emulador pero la versión desplegada es la anterior.
2. Agregar `BREVO_API_KEY` y un remitente verificado en las variables de Vercel.
   Sin eso el flujo funciona entero y el mail sale por consola.
3. Probar el circuito con `vercel dev` contra el emulador.

Decisiones que se tomaron acá y conviene no volver a discutir:

- **Auth Anónimo se movió a la Fase 3.5.** El plan original arrancaba migrando
  a Anonymous Auth, y resultó ser la decisión equivocada: un uid anónimo es
  un string que el cliente elige, así que no prueba nada. La reserva ahora la
  hace el servidor con el Admin SDK, y el token es el único secreto. Auth
  Anónimo queda para cuando haga falta algo que sí necesite un uid (una lista
  de "mis eventos" de un asistente, por ejemplo), y en ese momento conviene
  subir a Identity Platform, que ya es el producto pago.
- **La brecha de capacidad en `update` está cerrada** con
  `subirCapacidadRespetaElPlan()`: bajar o mantener la capacidad siempre se
  puede, y subir tiene que respear el plan. Con la versión anterior, un evento
  sobre el límite por excepción comercial quedaba congelado para siempre si se
  le revocaba la excepción.
- **La reserva no se hace desde el navegador.** Es la primera vez que el Admin
  SDK hace algo real, y el patrón ya estaba en `api/lib/firebase-admin.ts`.

## 1. Estado real por fase

El `README.md` tiene la tabla de las 10 fases con un ✅ o nada. Acá está el
detalle de qué quedó realmente hecho y **cómo se comprobó**, que es lo que la
tabla no dice.

### Fase 0 — Andamiaje ✅

Vite + React + Tailwind, dos builds (app y widget), Firebase Spark, deploy en
Vercel Hobby. Repo público en `github.com/CuatroSeis/EasyEventQR`.

Se comprobó que los dos builds producen su salida y que `dist/` y
`dist/widget/widget.js` llegan al CDN.

### Fase 1 — Login y seguridad multi-tenant ✅

Login con Google, bootstrap del documento `organizadores/{uid}`, guard de rutas
y reglas de aislamiento. El claim `admin` para super-admin.

Se comprobó con 45 tests de las reglas, corridos contra el emulador, que
cubren: un organizador no lee ni escribe eventos de otro; no se puede cambiar
el `organizadorId` de un evento existente; suspender una cuenta corta el
acceso; y el claim `admin` es la única vía para cruzar el aislamiento.

### Fase 2 — CRUD de eventos y branding ✅

Panel mobile-first con lista de eventos, alta y edición, y editor de branding
del panel. Rutas anidadas: `Protegido` envuelve a todas y lee el documento del
organizador una sola vez; `PanelLayout` envuelve a todas y pone la barra de
arriba, la acción principal fija abajo y el tema.

Se comprobó con 94 tests (32 unitarios + 62 de reglas) y compilando los dos
builds. Los tests de las reglas de límites están mutation-verificados: cambiar
el `>` por `>=` en el límite de capacidad, borrar la validación del nombre,
invertir la del precio y dejar de borrar en `removeProperty` los bajan a todos.
Un test que no falla cuando el código está roto no está probando nada.

**Lo que quedó fuera de la Fase 2, a propósito:**

- El logo del panel es un campo deshabilitado con el motivo al lado. Subir una
  imagen exige Firebase Storage, que a su vez exige Blaze. La alternativa es
  comprimir en el navegador y guardar en un documento aparte, y eso es media
  Fase 3, no un campo de formulario.
- El límite de capacidad se aplica al crear el evento y no al editarlo. Ver
  pendientes.

## 2. Cómo decidimos

Estas son las decisiones que no se deducen del código. La mayoría se tomaron
contra algo que se rompió.

**La seguridad vive en las reglas; la UI es UX.** El guard de rutas comprueba
la sesión porque es cómodo, pero si alguien lo borra o entra por la URL lo que
pasa es que ve una pantalla de "cargando" y los datos no llegan. Todo lo que
importa está en `firestore.rules`, que funciona aunque el cliente sea otro
cliente cualquiera.

**Los módulos de dominio son puros y no importan el SDK.**
`documentoEvento.ts` no importa nada de Firebase: `nuevoDocumentoEvento()`
devuelve un objeto plano. Eso permite testear toda la lógica de un evento en
milisegundos, sin emulador, y además los tests de reglas pueden importar la
misma función que usa la app, así que la forma del documento tiene un solo
origen. Cuando había que cambiar el modelo, se cambiaba un archivo.

**Las reglas de Firestore no pueden devolver el resultado de un `get()`.** Una
función de reglas tiene que terminar en un `let`/`return` de booleano, y
`get()` es una operación, no un valor. Por eso cada regla nueva hace su `get()`
inline aunque el código se repita. `respetaLimitesDeMarca()` existe para el
mensaje de error, no para evitar el `get()`.

**Las reglas tampoco pueden contar.** No hay `count()` ni forma de agregar
documentos en el motor de reglas. Por eso existe `capacidadMaximaPorEvento`
y no un "máximo de eventos": un límite por evento se valida comparando un
número contra otro, y un límite de cantidad de eventos no se puede escribir.

**Los límites comerciales se leen del documento, no de una tabla en las
reglas.** `respetaLimitesDeMarca()` lee `limitesPersonalizacion` del
organizador real. Es lo que hace que una excepción comercial se respete sin
redeploy, y lo que permite dar un logo a un pro+ que se lo compró aparte.

**Se despliega en este orden: reglas primero, frontend después.** Al revés, el
frontend nuevo puede mandar una escritura que la regla vieja rechaza y el
error le cae al usuario. Las reglas son el piso; el frontend camina arriba.

**Mobile-first de verdad, no desktop que se achica.** La acción principal está
fija abajo, al alcance del pulgar. Los campos de formulario miden 44px de alto
(`--touch-min`) y usan 16px de fuente, porque por debajo de 16px iOS hace zoom
al enfocar y el teclado tapa el campo que estás escribiendo. No hay modales:
en un celular el teclado tapa el modal y no hay dónde hacer scroll.
Cada pantalla es una página con su ruta.

**El color siempre viaja por variables CSS.** Nadie escribe un color en una
clase. Tailwind entiende `--color-primario: var(--c-primario)`, y el código
escribe `--c-primario` desde un documento de Firestore. El mismo componente con
los mismos bytes se ve distinto según el evento, y cambiar el tema es cambiar
el valor de una variable, no recompilar.

**`null` y `undefined` significan cosas distintas en el theming.**
`undefined` es "no lo toques" y `null` es "sacá la personalización". `null` tiene
que llamar a `removeProperty()`, no a no hacer nada: un organizador que se
pone un color y después lo saca se quedaba con el viejo pegado en el
`documentElement` para siempre, sin forma de limpiarlo salvo recargar la página
con otro build. Ese bug existió y ahora hay un test que lo cubre.

**Las rutas con Firebase van con `lazy()`.** Si el panel se importa de forma
estática, el SDK de Firebase entra en el bundle inicial y la landing pública
paga 537 kB que no necesita. Con `lazy()` queda en los chunks del panel: el
bundle inicial son 265 kB.

**En `/api/` los imports relativos llevan extensión `.js`.** Vercel transpila
archivo por archivo y no resuelve los imports relativos sin extensión; el
resultado es `ERR_MODULE_NOT_FOUND` en producción y ningún error en local. Es
el mismo problema que el typecheck lo detecta como `nodenext`.

**El dominio de Vercel generado con el nombre del equipo no sirve para público.**
Después de renombrar el proyecto, `easyeventqr-cuatroseis-projects.vercel.app`
muestra muro de login de Vercel (302 a `sso-api`). La forma corta
`easyeventqr.vercel.app` es la que sirve, y la de antes
(`easy-event-qr.vercel.app`) quedó redirigiendo con 307, que es lo que hay que
querer: los links ya compartidos siguen funcionando.

## 3. Fases que faltan

### Fase 3 — Registro público + theming dinámico + QR + mail

**Estado: implementada, pendiente de deploy y de la clave de Brevo.**

La fase más grande y la que cierra el producto: hasta acá se organizan eventos,
pero nadie podía reservar.

**Qué quedó hecho:**

- **Página pública** en `/e/:eventoId`, mobile-first, sin cuenta ni login. Usa
  `aplicarTema()` con los colores que trae `personalizacion` del evento en vez
  de los del panel, y limpia las variables al desmontar para que el color de un
  evento no se le pegue al siguiente en la misma sesión.
- **Registro del asistente** por `POST /api/registro`, con la reserva y el
  incremento de `Evento.reservas` en la MISMA transacción. El cupo no se cuenta:
  se compara contra un contador que escribe el servidor, porque `count()` no es
  confiable adentro de una transacción y las reglas de Firestore no pueden
  contar.
- **QR** con token de 192 bits (`crypto.randomBytes(24)` en base64url). A
  Firestore va el SHA-256, y el token en claro sale una sola vez, en el mail.
  El hash es además el ID del documento, así que la validación es un `get` y no
  una query, y dos reservas con el mismo token son imposibles por construcción.
- **Validación** por `GET /api/validar-qr?t=<token>`, de sólo lectura, sin
  email ni nombre en la respuesta. Escribir `usado` es la Fase 7.
- **Mail con Brevo**, armado en `api/lib/email.ts` (puro, testeable) y enviado
  por `api/lib/mail.ts` (el único archivo con `fetch`). Sin clave, sale por
  consola.
- **Anti-abuso**: límite por IP con lectura primero (60 req/min, 10
  envíos/hora, 30 envíos/día) y un campo trampa `sitioWeb` que responde 200 con
  la forma normal sin escribir nada.

**Lo que NO se hizo, a propósito:**

- **Auth Anónimo.** Se movió a la Fase 3.5. Un uid anónimo lo elige el
  cliente, así que no sirve para autorizar nada; el servidor con el Admin SDK
  hace la reserva y el token es el único secreto.
- **Deduplicación por email.** No hay. Registrarse dos veces con el mismo
  correo consume dos lugares. El email se normaliza (trim + minúsculas) para
  que la deduplicación sea un `where` y no una reconstrucción.
- **Filtro por fecha del evento.** El organizador abre y cierra con `estado`, y
  un segundo filtro invisible basado en el reloj contradice su elección explícita
  y produce un fallo que no puede arreglar desde el panel.
- **Marcar el QR como usado.** Es la Fase 7, con un operador en la puerta.

**Consecuencias que hay que tener presentes:**

- `reservas` cuenta reservas **emitidas**, no vivas. Si el organizador borra un
  registro desde el panel, el contador no baja. El reconteo en lote es de la
  Fase 6, y por eso el nombre es `reservas` y no `cupo`.
- Como sólo se guarda el hash, **no se puede regenerar ni exportar la imagen
  del QR**. La Fase 6 puede exportar los datos del asistente y reenviar el mail,
  pero no recuperar el PNG.
- El **201 no promete que el mail salió**. El mail va después de la
  transacción y `enviarMail()` no tira nunca: si Brevo está caído, la reserva
  queda igual y el reenvío es problema de la Fase 6. Un 500 que miente haría
  reintentar al usuario y duplicaría la reserva.

**Criterio de cierre:** alguien que no tiene cuenta entra a `/e/<id>`, se
anota, recibe el mail con un QR, y ese QR pasa el control de entrada. Falta la
clave de Brevo para el paso del medio, y el deploy de las reglas para que las
reglas nuevas sean las que corren.

### Fase 3.5 — Auth Anónimo (sacada de la Fase 3)

Lo que la Fase 3 empezó a hacer sin esta pieza, y por qué se postpone.

**Por qué se sacó de la Fase 3.** El plan original arrancaba migrando a
Firebase Auth Anonymous, con el argumento de que las reglas de `registros/`
dependen de que exista un uid anónimo. El problema es que un uid anónimo es un
string que elige el cliente: sirve para agrupar documentos del mismo visitante,
no para autorizar nada. Como la reserva la hace el servidor con el Admin SDK y
el único secreto es el token, el uid anónimo no hacía falta para nada.

**Cuándo hace falta, entonces.** Cuando aparezca una función que requiera
recordar quién es el visitante: "mis eventos" para un asistente, o un
recordatorio de QR a las 24 horas. Ahí hay que decidir dos cosas.

- **Si vale la pena Anonymous Auth.** Sus cuotas son duras: 50.000 usuarios
  activos mensuales en el plan Spark, y cada usuario anónimo consume uno. Un
  evento popular con público que reserva y vuelve al mes siguiente consume
  usuarios.
- **Si conviene Identity Platform de una.** Es el producto de pago de Firebase
  y ya trae lo que el anonimo no da: usuarios que se recuperan, quota que
  escala, y un lugar único donde después entra la verificación por SMS. Migrar
  después significa volver a migrar los documentos.

**Recomendación: no hacerlo.** Agregarlo "por las dudas" es la forma más
cara de no hacer nada, porque una vez que hay documentos que dependen del uid,
sacarlo es una migración. Lo que hay que hacer en su lugar, cuando aparezca
la necesidad, es una collection de "visitantes" con un token de sesión propio,
que ya es el patrón que usa la reserva.

### Fase 4 — `<ticket-widget>` embebible

Web Component en Shadow DOM, con su propio bundle y su propio shadow root, para
que un organizador lo meta con un `<script src>` en su web sin que nuestros
estilos le rompan la página ni al revés.

El build ya está configurado (`vite.widget.config.ts`, salida IIFE en
`public/widget/widget.js` → `dist/widget/widget.js`) y `aplicarTema()` ya pide
un `RaizCss` estructural justamente para poder escribir sobre el shadow root.

**Criterio de cierre:** una página de terceros con el script embebido muestra el
formulario de registro con los colores del evento, sin estilos filtrados.

### Fase 5 — Capa de pagos desacoplada + webhook firmado

Modo simulado primero, para no atar el proyecto a un proveedor ni sooner. El
webhook va firmado y verificado, y es la primera vez que el servidor es la
fuente de verdad: acá es donde se cierra bien el tema del cupo, revalidando en
el servidor y no en el cliente.

**Criterio de cierre:** un evento pago toma reservas, el webhook firmado activa
el QR, y un webhook con firma inválida no activa nada.

### Fase 6 — Panel de registros + exportación en lote

Listado de reservas con búsqueda, y exportación a CSV vía `/api/`. Requiere el
service account, que también hace falta en las Fases 3 y 5.

**Lo que hay que corregir de la definición original:** decía "descarga de QRs
en lote", y no se puede. Como la Fase 3 sólo guarda el SHA-256 del token y no
el token en claro, la imagen del QR no se puede regenerar a partir del
documento: no es que sea difícil, es que la información no está. Cualquier
funcionalidad que asumiera "volver a bajar el QR" tiene que ser otra cosa.

**Lo que sí entra, y es lo que de verdad falta:**

- **CSV de asistentes**, con nombre, correo, teléfono, estado y fecha.
- **Reenvío del mail** a uno o a todos. Es el arreglo de la reserva sin mail,
  que es el hueco que dejó el diseño de "el mail va después de la transacción".
- **El reconteo de `reservas`.** El contador cuenta reservas emitidas y no baja
  cuando se borra un registro, así que hay que ofrecer "recalcular el cupo real"
  como una transacción explícita y auditada, no como algo que pase solo.
- **Un aviso de a quién se va a quedar sin mail.** Los correos rebotados de Brevo se
  pueden leer por API, y esa es la lista de a quién hay que reenviar.

**Criterio de cierre:** el organizador ve quién se anotó, baja el CSV, y
reenvía el mail a quien no lo recibió.

### Fase 7 — Escáner QR + link temporal de operador

Lo más delicado del producto. El escaneo tiene que ser **atómico**: una
transacción de Firestore que marque la reserva como usada, para que dos
personas escaneando el mismo QR al mismo tiempo no lo puedan usar dos veces.

El link del operador es temporal y firmado, para que el que escanea no tenga
cuenta y el link no sirva para siempre.

**Criterio de cierre:** el mismo QR escaneado dos veces pasa una sola vez, y el
link del operador deja de funcionar a la hora que dice.

### Fase 8 — Panel de super-admin

Desktop-first, porque es una herramienta de escritorio. Listar organizadores,
cambiar planes, dar excepciones de límites.

El claim `admin` ya está implementado y probado, así que la parte difícil
—cruzar el aislamiento sin romperlo— ya está.

**Criterio de cierre:** un super-admin cambia el plan de un organizador y ese
organizador ve el cambio en la navegación siguiente, sin deploy.

### Fase 9 — Pulido responsive + README + demo

Revisión de todas las pantallas en móvil y desktop, README al día, y una demo
pública con datos de ejemplo.

## 4. Pendientes que no son fases

Nada de esto es una fase. Son cosas que están abiertas.

- **`FIREBASE_SERVICE_ACCOUNT` ✅ ya configurada.** Cargada en Vercel para
  Production y Preview, con `/api/salud` respondiendo `ok: true`. La clave ya no
  está en la máquina: el `.json` que baja la consola de Firebase se borró, y
  Vercel la guarda cifrada. Ojo con esto la próxima vez: el `.gitignore` ahora
  cubre `*-firebase-adminsdk-*.json`, pero los patrones que tenía antes
  (`*service-account*.json`) no matcheaban el nombre real que usa Firebase, así
  que la clave quedó untracked y sin ignorar a un `git add -A` de terminar en
  el repo público. No se llegó a commitear, pero el agujero estaba.
- **Clave de Brevo sin configurar.** Es lo único que queda bloqueando el mail
  de la Fase 3. Ojo con "Block unknown IP addresses": los correos salen desde
  IPs dinámicas de Vercel y el envío se rompe de forma intermitente. El
  remitente tiene que estar verificado en Senders & Domains. Cuando se cargue,
  en Preview va con `--git-branch ""` a propósito: sin ese flag el CLI pide la
  rama interactivamente aunque le mandes el valor por stdin, y en modo no
  interactivo se queda esperando y no guarda nada.
- **~~La capacidad se puede subir editando el evento.~~ Cerrada en la Fase 3.**
  La brecha era que `capacidadDentroDelPlan` validaba en `create` y no en
  `update`, así que un organizador podía crear un evento con 100 y subirlo a
  5000 editándolo. Ahora hay `subirCapacidadRespetaElPlan()` en el `update`.
  La forma de la regla importa: NO es "el nuevo valor tiene que estar dentro
  del plan", sino "si el nuevo valor es mayor que el actual, tiene que estar
  dentro del plan". Con la versión estricta, un evento que quedó por encima del
  plan por una excepción comercial que después se revocaba quedaba congelado
  para siempre: no se podía ni bajar. Ahora bajar y mantener siempre se puede.
  Probado con mutación de la regla, no sólo con casos felices.
- **No hay CI.** Todo se corre a mano: `npm run typecheck`, `npm run test` y
  `npm run build`. Los tests son rápidos y el emulador levanta solo, así que
  un workflow de GitHub Actions es trabajo de una tarde. Fuera de alcance por
  decisión.
- **Auto-deploy sin conectar.** El proyecto de Vercel no está enlazado al repo:
  los deploys salen de `vercel deploy --prod` a mano. Conectar el repo evita
  olvidar un deploy, y también obliga a que CI pase antes de publicar.
- **No hay dominio propio.** La URL actual es `easyeventqr.vercel.app`, que
  funciona, pero es un dominio de Vercel. Antes de cobrarle a un organizador de
  verdad hace falta un dominio propio: es lo que hace que la dirección del
  producto no parezca un servicio interno, y no se puede cambiar después sin
  romper los links que ya se compartieron.
- **Vercel Hobby dice "uso personal, no comercial".** Para el MVP va. El día
  que se cobre hay que migrar a Pro, y por eso el backend ya está aislado en
  `api/`.
- **Sin CI ni tests end-to-end.** Hay 89 tests de reglas y 120 unitarios, pero
  nada ejercita la UI ni los endpoints contra el emulador. La Fase 3 puso el
  primer flujo de verdad que cruza las dos cosas, y el hueco se nota: `api/`
  se prueba por partes puras, no de punta a punta. Un test de integración de
  `POST /api/registro` contra el emulador, con Admin SDK apuntando al emulador,
  es el próximo paso que más valor da por hora. Los flujos de pago y mail de la
  Fase 5 van a necesitarlo sí o sí.
- **El límite por IP es un documento por IP, sin limpieza.** La colección
  `rateLimit/` crece para siempre: un documento por cada IP que intentó
  reservar, unos 64 bytes. No es un problema hoy y va a ser uno en un año, con
  una regla de borrado por `desdeDia` que se pueda correr con un trigger o a
  mano. Queda anotado para que no sorprenda.
