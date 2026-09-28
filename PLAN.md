# Plan de trabajo

Este archivo es el documento vivo del proyecto: dónde quedó cada fase, cómo se
decidió lo que se decidió, qué falta y por qué. El `README.md` explica cómo
funciona el producto; este explica cómo se llegó hasta acá y qué hay que hacer
mañana.

Cuando se termine una fase, se actualizan las dos tablas de más abajo. Si una
decisión del código no se entiende leyendo el código, se escribe acá.

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

La fase más grande y la que cierra el producto: hasta acá se organizan eventos,
pero nadie puede reservar.

- Página pública del evento, mobile-first, sin cuenta ni login.
- `aplicarTema()` ya está hecho y es el que se usa acá, con los colores que
  trae `personalizacion` del evento en vez de los del panel. Es la misma función
  que va a usar el widget de la Fase 4, y por eso vive en `src/shared/`.
- Registro del asistente: auth anónimo + documento de reserva, con reglas que
  verifiquen cupo y fecha.
- QR: token único por reserva, guardado hasheado, y validación. El hash es lo
  que va a Firestore; el token en claro sólo se manda por mail.
- Mail de confirmación con Brevo.

**La bloquea `FIREBASE_SERVICE_ACCOUNT`, que todavía no está en Vercel.** Sin
eso `/api/salud` responde `ok: false` con `etapa: "service-account"`, que es la
respuesta diseñada, no un error. Y falta la clave de Brevo.

**Criterio de cierre:** alguien que no tiene cuenta entra a `/e/<id>`, se
anota, recibe el mail con un QR, y ese QR pasa el control de entrada.

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

### Fase 6 — Panel de registros + descarga de QRs en lote

Listado de reservas con búsqueda, y exportación a CSV vía `/api/`. Requiere el
service account, que también hace falta en las Fases 3 y 5.

**Criterio de cierre:** el organizador ve quién se anotó y baja un CSV que
sirve para imprimir y controlar la puerta.

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

- **`FIREBASE_SERVICE_ACCOUNT` sin configurar.** No bloquea las Fases 1 y 2
  (son todo cliente), pero bloquea la 3. Es un JSON con clave privada y va
  únicamente en variables de entorno de Vercel.
- **Clave de Brevo sin configurar.** Bloquea el mail de la Fase 3. Ojo con
  "Block unknown IP addresses": los correos salen desde IPs dinámicas de Vercel y
  el envío se rompe de forma intermitente.
- **La capacidad se puede subir editando el evento.** La regla
  `capacidadDentroDelPlan` valida en `create` y no en `update`, así que un
  organizador puede crear un evento con 100 y después subirlo a 5000
  editándolo. Se decidió así a propósito, para no bloquear la edición, pero
  es una brecha real del límite comercial. Hay que decidir: o se valida también
  en update, o se acepta el riesgo hasta que el servidor sea la fuente de
  verdad en la Fase 5.
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
- **Sin CI ni tests end-to-end.** Hay 62 tests de reglas y 32 unitarios, pero
  nada ejercita la UI contra el emulador. La Fase 3 es el momento de decidir si
  eso alcanza, porque ahí aparecen los flujos de pago y mail, que son los que
  más se rompen.
