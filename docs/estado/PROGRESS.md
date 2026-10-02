# EasyEventQR - Progress Report

## Estado Actual: ✅ Deploy a producción funcionando

### Sesión del 2 Oct 2026 — el deploy pasó verde

El objetivo era que `https://easyeventqr.vercel.app` sirviera el backend, y no lo
hacía: **las 9 functions devolvían 500**. Eran tres causas encadenadas, y cada
una tapaba a la siguiente.

**1. `tsconfig.tests.json` estaba en el grafo de build** (`TS18003`).
`.vercelignore` saca `tests/` del upload, y `tsconfig.json` —el que corre
`vercel build`— lo referenciaba. Al no subir la carpeta, ese proyecto se queda
sin inputs y `tsc -b` abortaba antes de compilar. Los tests ahora se typecheckean
por el script `typecheck`, fuera del camino de producción.

**2. CI corría en Node 20** y los tests necesitan **Node 22.6+**: importan `.ts`
con la extensión explícita y los ejecuta el type-stripping nativo. En Node 20 no
parsean y los jobs `Unit Tests` y `Firestore Rules Tests` morían con exit 1
aunque el código estuviera bien. Era el fallo más engañoso de los tres: se leía
como "los tests están rotos" cuando era el runtime.

**3. Las functions usaban el alias `@server/*`** (`FUNCTION_INVOCATION_FAILED`).
El alias está en `compilerOptions.paths` de `tsconfig.api.json`, que TypeScript y
Vite resuelven — local todo andaba. Vercel empaqueta las functions con su propio
builder, que no lee ese archivo, así que el import moría al resolver:
`FUNCTION_INVOCATION_FAILED`, un 500 opaco sin stack. Pasaron a imports relativos.

Y un cuarto, encimado al anterior: **`firebase-admin/auth` como import estático**
no lo empaqueta Vercel. El mapeo de los 9 endpoints lo dejó obvio:

| Endpoint | Antes | Causa |
|---|---|---|
| `salud` | 200 | — |
| `me` | **500** | import estático de `/auth` |
| `evento-publico` | 404 | — |
| `registros` | 400 | ya usaba import dinámico |
| `admin-organizadores` | **500** | import estático de `/auth` |
| `operador` | 405 | ya usaba import dinámico |

Los dos que fallaban eran exactamente los dos con import estático. Ahora los
cuatro que usan `getAuth` lo hacen con `await import()`.

**Estado verificado en producción:**

```bash
curl https://easyeventqr.vercel.app/api/salud
# {"ok":true,"proyecto":"easyeventqr-dev","organizadores":1,"entorno":"production"}

curl https://easyeventqr.vercel.app/api/me
# {"ok":true,"uid":null,"isAdmin":false,"porQue":"sin-sesion","organizador":null}

curl "https://easyeventqr.vercel.app/api/admin-organizadores?accion=listar"
# {"ok":false,"error":"Falta el token de sesión."}   ← 401, ya no 500
```

### Pendiente para cerrar el MVP

> El plan detallado, con el árbol de diagnóstico de `/admin` y los comandos de
> verificación, está en **[SIGUIENTE.md](./SIGUIENTE.md)**.

- [ ] **`/admin` expulsa al usuario aunque esté iniciado** — leer el campo
      `porQue` de la respuesta de `/api/me` y seguir el árbol de
      `SIGUIENTE.md` §1. Causa más probable: `SUPER_ADMIN_UID` no está puesta
      en Vercel (el UID real es `c4HRa54bB7XSEyOigo2fHqgTL4h1`).
- [ ] Recorrer los 12 pasos de [`../arquitectura/ENDPOINTS.md`](../arquitectura/ENDPOINTS.md).
- [ ] **Rotar el service account**: la clave privada se imprimió en una sesión de
      chat. Crear una nueva en Google Cloud → IAM → Service Accounts → Keys,
      actualizar `FIREBASE_SERVICE_ACCOUNT` en Vercel y borrar la clave vieja.
- [ ] `OPERADOR_SECRET`: rotar el que se pegó en el chat (32+ caracteres).
- [ ] `MERCADOPAGO_SIMULADO=true` sólo para pruebas; apagarlo antes de compartir.

### ✅ Completado (Fases 0-8)

#### Fases Implementadas:
- **Fase 0**: Andamiaje (Vite + React + Tailwind + Firebase + Vercel)
- **Fase 1**: Login Google + Seguridad multi-tenant
- **Fase 2**: CRUD Eventos + Branding
- **Fase 3**: Registro Público + QR + Mail (Brevo)
- **Fase 4**: Widget Embebible `<ticket-widget>` (Shadow DOM + IIFE)
- **Fase 5**: Pagos Simulados (Mercado Pago mock)
- **Fase 6**: Panel Registros + CSV + Reenvío Mail + Reconteo
- **Fase 7**: Escáner QR + Link Operador JWT (transacción atómica)
- **Fase 8**: Panel Super-Admin (dashboard, organizadores, eventos, registros, excepciones, auditoría)

#### CI/CD:
- GitHub Actions (`.github/workflows/ci.yml`) + Dependabot
- TypeCheck → Lint → Unit Tests → Rules Tests → Build → Deploy
- `cache: 'gradle'` eliminado de `setup-java`: no hay archivos Gradle en el repo y
  ese cache abortaba `test-rules`, lo que tumbaba `build` y con él el deploy.

### Estado del Código

```bash
npm run typecheck  # ✅ TypeScript strict, 0 errores
npm run lint       # ✅ Solo warnings preexistentes (set-state-in-effect)
npm run test       # ✅ 252 tests (163 unit + 89 reglas)
npm run build      # ✅ Compila app + widget
```

### API Endpoints — 9 funciones (límite Hobby: 12)

```
GET  /api/salud
GET  /api/evento-publico?id=<id>
POST /api/registro
GET  /api/validar?t=<token>&eventoId=<id>
POST /api/validar {token, eventoId}
GET  /api/me
POST /api/pagos
POST /api/pagos/webhook
GET|POST /api/operador
GET  /api/registros
GET  /api/admin-organizadores?accion=<accion>
```

**9 funciones. Margen: 3.**

#### El router del super-admin

`api/admin-organizadores.ts` enruta por `?accion=`:

| accion | método | qué hace |
|---|---|---|
| `organizadores` | GET | lista todos con plan, estado y límites |
| `organizadores` | PATCH | cambia plan o suspende/reactiva |
| `organizadores` | DELETE | borra cuenta + eventos + registros + usuario de Auth |
| `dashboard` | GET | métricas con `count()` de Firestore |
| `eventos` | GET / PATCH | listado global / cerrar / reabrir |
| `registros` | GET | registros de todos los eventos (con nombre de evento y organizador) |
| `excepciones` | GET / POST / DELETE | límites que se apartan del plan |
| `auditoria` | GET | historial de acciones del admin |

Una función por pantalla habría dejado la app en 14 funciones y Vercel
rechazaba el despliegue con *"No more than 12 Serverless Functions"*.

### Cambios de seguridad en esta fase

1. **Autenticación real**: `verifyIdToken` contra `SUPER_ADMIN_UID`. Antes se
   aceptaba el header `x-user-uid` que mandaba el cliente — con conocer el UID
   del super-admin (público, viaja en la URL) cualquiera se autopromovía.
   Eliminado también de `/api/me`.
2. **AdminPanel manda el token**: `fetch('/api/me')` sin `Authorization`
   devolvía siempre `isAdmin: false` y expulsaba al super-admin en un bucle.
3. **Auditoría en colección propia** escrita con Admin SDK: si viviera en el
   documento del organizador, un cliente con permiso de update borraría su
   propio rastro.
4. **El super-admin no puede borrarse a sí mismo** (`uid === SUPER_ADMIN_UID`).
5. **Confirmación doble** para eliminar un organizador y sus datos.

### Estructura

```
api/                                  # 9 funciones serverless
├── admin-organizadores.ts            # router ?accion= (Fase 8)
├── evento-publico.ts
├── me.ts
├── operador.ts
├── pagos.ts
├── registro.ts
├── registros.ts
├── salud.ts
└── validar.ts

src/server/lib/                       # 8 módulos compartidos, NO functions
src/services/admin.ts                 # cliente del panel (envía ID token)
src/app/pages/admin/
├── AdminPanel.tsx                    # shell + tabs + verificación
├── DashboardTab.tsx
├── OrganizadoresTab.tsx
├── EventosTab.tsx
├── RegistrosTab.tsx
├── ExcepcionesTab.tsx
├── AuditoriaTab.tsx
├── Cargando.tsx                      # skeleton compartido
└── MensajeError.tsx
```

### Variables de Entorno en Vercel

```
FIREBASE_SERVICE_ACCOUNT=<json en 1 línea>
FIREBASE_PROJECT_ID=easyeventqr
SUPER_ADMIN_UID=<uid de firebase auth>
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=remitente@verificado.com
BREVO_SENDER_NAME=EasyEventQR
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=whsec-...
OPERADOR_SECRET=<base64 de 32+ chars>
APP_URL=https://easyeventqr.vercel.app
```

### Auditoría de seguridad y correctitud (2026-10-02)

Bugs encontrados y corregidos, ordenados por lo que rompen:

| Severidad | Dónde | Qué pasaba |
|---|---|---|
| **Crítico** | `api/registros.ts`, `api/operador.ts` | Fallback a `x-user-uid`: el chequeo de propiedad comparaba el UID que elegía el cliente. Con un header cualquiera se listaban, exportaban y reenviaban los registros de **cualquier** evento, y se fabricaban links de operador ajenos. |
| **Crítico** | `api/operador.ts` | `OPERADOR_SECRET` tenía un valor por defecto hardcodeado en el repo. Sin la variable en el entorno, los JWT HS256 se firmaban con un secreto público. Ahora falla cerrado. |
| **Crítico** | `api/validar.ts` | `POST` buscaba `doc(token)` con el token en claro; el documento se llama por su SHA-256. **El escáner de la puerta no funcionaba nunca**: toda entrada daba "Código no válido". El `GET` sí hasheaba. |
| **Crítico** | `.github/workflows/ci.yml` | `vercel deploy ... dist/` subía sólo el frontend: `api/` nunca llegaba a producción. |
| **Alto** | `api/admin-organizadores.ts`, `api/me.ts` | Se aceptaba `x-user-uid` como credencial de super-admin, y el panel lo mandaba. Conocer el UID del admin (público, en la URL) bastaba para autopromoverse. |
| **Alto** | `src/app/pages/Branding.tsx` | `enviar()` sin `preventDefault()`: el `<form>` hacía submit nativo, recargaba la página y cancelaba el `updateDoc`. Symptoms: "se reinicia y no guarda". |
| **Alto** | `api/registros.ts` (reenvío) | Fabricaba `mock_token_<id>`, que no era un token válido: el QR reenviado daba "Ese código no existe". Ahora rota el token **después** de que el mail salga, y avisa que el QR anterior dejó de servir. |
| **Medio** | `src/services/registros.ts` | Los cuatro calls a `/api/registros` no mandaban `Authorization`. Con el fallback eliminado, hubiesen dado 401: el fix de seguridad los dejaba rotos. |
| **Medio** | `src/services/pagos.ts`, `api/pagos.ts` | `verificarEstadoPago()` pedía `/api/registros/<id>`, ruta que nunca existió. Se agregó `GET /api/pagos/estado`, que devuelve **sólo** el estado (no PII, porque no hay auth y el `registroId` es adivinable). |
| **Medio** | `src/services/documentoEvento.ts` | `nombre`, `lugar` y `descripcion` sin tope de longitud ni filtro de caracteres de control. `nombre` va crudo al `subject` del mail (el HTML sí escapa): un `\r\n` habilita inyección de cabeceras. |
| **Medio** | `api/admin-organizadores.ts` | El super-admin se reconocía por `SUPER_ADMIN_UID` mientras las reglas usan el claim `admin`: sistema partido. Ahora se acepta cualquiera de los dos, y el claim es el mecanismo compartido (las reglas no pueden leer env). |
| **Bajo** | `.github/workflows/ci.yml`, `.vercelignore`, `.github/dependabot.yml` | `permissions` sin declarar (heredaba el default del repo), sin `.vercelignore` (los service account subían al deploy), y Dependabot sin el ecosistema `github-actions`. |

Falsos positivos que se descartaron al verificar, para que nadie los
vuelva a reportar:

- **XSS en los templates de mail**: `email.ts` ya tiene `escapar()` y lo
  aplica a `nombre`, `lugar`, `nombreAsistente` y `textoConfirmacion`.
- **`bannerUrl` sin validar**: `validarBorrador()` ya exige `http:`/`https:`.
- **`logoUrl` sin validar**: no hay ninguna vía de escritura; todos los
  caminos hacen `logoUrl: null`. Es latente, no activo.

### Checkout simulado (opción A) y deploy por Actions

**`/pago/simulado`** es la pantalla que faltaba: `crearPreferenceMP()`
devolvía un `init_point` a esa ruta y no existía, así que el invitado caía en
un 404 y el flujo de pagos estaba muerto de punta a punta. Tiene botones de
aprobar y rechazar que pegan al webhook, que es lo que haría MP del otro
lado. El banner de "MODO SIMULACIÓN" va arriba de todo, no en un pie: si
pareciera un checkout real, alguien creería que el botón de rechazar es una
funcionalidad del producto.

**Todo el flujo de pagos quedó detrás de `MERCADOPAGO_SIMULADO`, apagado por
defecto.** No se decide en el código si "estamos en dev": se decide con una
variable que hay que prender a propósito, porque con la simulación prendida
cualquiera con el link de una reserva puede marcarse su propia entrada como
pagada. La comparación es contra el string exacto `'true'` y no con
`Boolean()`, porque `Boolean('false')` es `true` y un
`MERCADOPAGO_SIMULADO=false` en el panel de Vercel terminaría prendiendo la
simulación en producción.

`verificarFirmaMP()` dejó de devolver `true` siempre: ahora valida el HMAC
real de Mercado Pago con `timingSafeEqual` y ventana de 5 minutos, y
devuelve `false` si no hay secreto configurado. Con `MERCADOPAGO_WEBHOOK_SECRET`
puesto, un webhook sin firma válida recibe 401.

**El deploy lo hace sólo GitHub Actions** (push a `main` → producción, PR →
preview). Hay que **apagar la integración Git de Vercel a mano** en
Settings → Git, si no los dos deploys se pisan. El workflow ya despliega la
raíz y no `dist/`, así que Vercel corre su propio build y sube `api/`; por
eso el job dejó de bajar el artifact, que ya no servía para nada.

`../arquitectura/ENDPOINTS.md` tiene el mapa completo: cada endpoint, la pantalla que lo
dispara y cómo probarlo sin `curl`.

### UX de permisos y auditoría de diseño (2026-10-02)

El síntoma reportado era "dice que no tengo permisos para crear ni editar
eventos", que es el peor tipo de bug de permisos: no dice **por qué**.

- `src/services/errores.ts`: tradutor único de `permission-denied`.
  Distingue cuatro causas — `suspendido`, `sin-documento`, `plan`,
  `desconocido` — y expone `ErrorDePermiso` para que la UI pueda reaccionar
  distinto según la causa.
- El mensaje anterior era **peor que no tener mensaje**: culpaba al plan
  incluso con la cuenta suspendida, y mandaba al usuario a cambiar el plan
  en vez de a reactivar la cuenta. `tests/unit/errores.test.ts` (9 casos)
  fija que la suspensión nunca se reporte como límite de plan.
- `crearEvento`, `actualizarEvento`, `cambiarEstadoEvento` y
  `eliminarEvento` reciben el organizador para poder atribuir la causa y
  mostrar los números cuando es un tope de capacidad.
- `Protegido.tsx`: pantalla propia para `estadoSuscripcion === 'suspendido'`
  en vez del `permission-denied` crudo.

**Bug encontrado y corregido al revisar el anterior:** `/admin` estaba
anidada dentro de `<Protegido>`. Como `Protegido` exige cuenta activa, un
super-admin suspendido quedaba encerrado en un cartel que decía "pedí que
te reactiven" sin darle el panel donde pedirlo. `/admin` se movió fuera del
gate (se autoriza sola contra `/api/me`) y `AdminPanel` pasó a leer el
nombre del usuario de Firebase en vez del contexto de organizador, que ahí
sería `null`. Cubierto por `tests/unit/rutas.test.ts` (4 casos), verificado
reintroduciendo el bug.

### Auditoría de diseño (skill `ui-ux-pro-max-skill`)

`design-audit.mjs` sobre `/` y `/entrar` en 6 viewports (360 → 1920px):

- `tap-target`: dos links con área táctil de 16px y 32px de alto, por
  debajo de los 44px de WCAG 2.5.8. Corregidos con `inline-flex
  min-h-11`, que agranda el área sin tocar el tamaño del texto.
- Sin favicon: el navegador pedía `/favicon.ico` y recibía un 404 en cada
  carga. Agregado `public/favicon.svg` enlazado en `index.html`.
- Resultado final: **0 high, 0 medium, 0 low, 0 errores de consola.**

### Bugs encontrados al ir a cerrar el E2E (2026-10-02, 2da tanda)

En la tanda anterior se arregló `src/services/registros.ts` para que mandara
`Authorization`. El problema es que **ese archivo no era el que usaba la
pantalla**: `PanelRegistros.tsx` llama a la API con `fetch` a pelo. El service
quedó bien y la pantalla siguió rota, que es la forma más difícil de detectar
un bug: la mitad del módulo está bien.

| Severidad | Dónde | Qué pasaba |
|---|---|---|
| **Crítico** | `src/app/pages/PanelRegistros.tsx` | Los 5 `fetch` (`listar`, `exportar`, `resend`, `recount`) no mandaban `Authorization`. Con el fallback `x-user-uid` eliminado, **el panel de registros entero devolvía 401**. El síntoma ("no puedo ver mis registros") no señalaba la causa. |
| **Crítico** | `src/services/registros.ts`, `src/services/pagos.ts` | URLs con `import.meta.env.VITE_APP_URL || 'https://easyeventqr.vercel.app'`. El `.env.local` define `APP_URL`, **sin** el prefijo `VITE_`, así que la variable nunca existía y caía siempre al fallback: **la app de desarrollo pegaba contra la API de PRODUCCIÓN**. Ahora van relativas (`/api/...`), sin variable que olvidar. |
| **Alto** | `api/operador/link` | El endpoint existía desde la Fase 7 sin ninguna pantalla que lo llamara. El organizador no tenía forma de generar el link de puerta, así que el paso 11 de `../arquitectura/ENDPOINTS.md` era inejecutable sin abrir la consola del navegador. Ahora hay botón + panel con el link, la expiración y copiar. |
| **Medio** | `PanelRegistros.tsx` | `alert()` para cada resultado y un `RegistroUI` duplicado del service. Unificado: se usa el tipo del service y los avisos son `role="status"` / `role="alert"`. |
| **Bajo** | `.env.example`, `.env.local` | `VITE_SUPER_ADMIN_UID` con prefijo `VITE_` viaja dentro del bundle. Hoy el frontend no la usa, pero dejarla a mano es una trampa para el próximo que la use. Renombrada a `SUPER_ADMIN_UID`. |

`tests/unit/auth-frontend.test.ts` (2 casos) ata las dos causas: ninguna página
puede llamar a un endpoint autenticado con `fetch` sin `Authorization` cerca, y
ningún service puede tener el dominio de producción hardcodeado. Verificado
reintroduciendo el bug.

**El `resend` rota el token a propósito**, y ahora la UI lo dice antes de
confirmar y después de mandar, en vez de esconderlo detrás de un `alert`. Si no,
el organizador invalida entradas sin avisar y el asistente llega a la puerta con
un QR muerto.

### Acceso al panel super-admin (2026-10-02, 3ra tanda)

Síntoma reportado: "no hay botón de logout, y cada vez que entro a `/admin`
me kicked". Eran dos bugs encimados.

**1. `/api/me` decidía super-admin distinto que `api/admin-organizadores.ts`.**
Las dos son la misma puerta: `/api/me` decide si el panel se abre, y
`api/admin-organizadores` revisa cada operación. Pero la primera miraba sólo
`SUPER_ADMIN_UID` e **ignoraba el custom claim `admin`**. Con el claim
asignado y la variable sin definir —que es el estado normal de un entorno
nuevo— `isAdmin` volvía `false` siempre: el super-admin era echado de su
propio panel. Ahora ambas usan el mismo criterio (claim OR variable) y
`tests/unit/admin-me.test.ts` (6 casos) ata las dos mitades.

**2. No había forma de renovar el token.** Los custom claims van horneados en
el ID token que emite Firebase, y ese token se cachea una hora. Poner el
claim y recargar con F5 no cambia nada: el navegador sigue mandando el token
viejo. El único camino era cerrar sesión a mano en las herramientas de
Google, algo que el usuario no tiene por qué saber. Ahora hay botón **Salir**
en la barra del panel, y la pantalla de acceso denegado lo repite.

**3. `AdminPanel` expulsaba en silencio.** `return null` más un
`navigate('/panel')` sin texto. Un rechazo de permisos que no dice *qué*
permiso falta es indistinguible de un bug. Ahora
`src/app/pages/admin/AccesoDenegado.tsx` distingue "falta la variable de
entorno", "no tenés el claim", "falló la verificación" y "no hay sesión", y
cada uno con sus pasos. El motivo viaja en `porQue` desde `/api/me`, que no
autoriza nada: sólo existe para que la UI pueda explicar.

### Pendiente antes de producción

Los pasos con detalle (dónde se hace, cómo se comprueba) están en
**`../operacion/GUIA_MANUAL.md`**. Resumen:

1. 🔴 **Rotar `OPERADOR_SECRET`** — el valor hardcodeado estuvo en el repo.
   Con el valor viejo, cualquiera que lo lea puede firmar el link de operador
   de cualquier evento.
2. 🔴 **Apagar la integración Git de Vercel** (Settings → Git). Es manual.
   Mientras esté prendida, los dos deploys se pisan.
3. 🔴 **Claim `admin: true`** en el documento del organizador de
   `ivanrufinocontac@gmail.com`, o `SUPER_ADMIN_UID` en Vercel. Sin esto
   `/admin` expulsa al super-admin en el bucle de redirección.
4. 🔴 **`MERCADOPAGO_SIMULADO=true`** para probar el checkout. **Apagarla antes
   de compartir la app**: con la simulación prendida, cualquiera con el link de
   una reserva se marca su propia entrada como pagada.
5. **Confirmar que llega el mail.** El QR viaja sólo por mail; si Brevo no
   está verificado, la inscripción "funciona" y el asistente nunca recibe su
   entrada.
6. **Correr los 12 pasos de `../arquitectura/ENDPOINTS.md`.** En el paso 7, si da error de
   sesión en vez de la lista, quedó algún `fetch` sin `Authorization`.
7. **`TOPE_LECTURA = 2000`** en el listado global del panel admin: los filtros
   y el total mienten con más de 2000 registros. No bloquea el MVP.
8. **Conectar Mercado Pago real.** Hoy `MERCADOPAGO_ACCESS_TOKEN` no lo usa
   nadie: falta el SDK y la creación de la preferencia real. La simulación
   cubre el recorrido completo para demo.

### Próximas fases

- **Fase 9**: pulido, demo y README
- Dominio propio
- Monitoreo (Sentry / logs estructurados)
- Mercado Pago real + webhooks reales