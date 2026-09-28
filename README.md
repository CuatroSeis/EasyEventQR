# EasyEventQR

Sistema de venta y reserva de entradas con validación por QR, multi-tenant, para
alquilarse a organizadores de eventos.

Tres actores, tres superficies distintas:

| Actor | Superficie | Criterio de diseño |
|---|---|---|
| **Cliente final** (asistente) | Landing pública + widget embebido | mobile-first, sin cuenta, sin login |
| **Organizador** (cliente que paga) | Panel privado | mobile-first: opera desde el celular, en la puerta |
| **Super-admin** (dueño de la plataforma) | Panel interno | desktop-first: es una herramienta de escritorio |

## Las 10 fases

Cada fase es un entregable que anda por sí solo. Se termina una, se muestra, y
se pasa a la siguiente.

El detalle de qué quedó hecho en cada una, cómo se comprobó, y qué falta
está en [`PLAN.md`](./PLAN.md), que es el documento de trabajo del proyecto.

| # | Entregable | Estado |
|---|---|---|
| 0 | Vite + React + Tailwind + Firebase, dos builds, deploy en Vercel | ✅ |
| 1 | Login con Google + reglas de seguridad multi-tenant | ✅ |
| 2 | CRUD de eventos (mobile-first) + branding del panel | ✅ |
| 3 | Registro público + theming dinámico + QR + mail | |
| 4 | `<ticket-widget>` embebible (Shadow DOM, bundle propio) | |
| 5 | Capa de pagos desacoplada (modo simulado) + webhook firmado | |
| 6 | Panel de gestión de registros + descarga de QRs en lote | |
| 7 | Escáner de QR con transacción atómica + link temporal de operador | |
| 8 | Panel de super-admin (desktop-first) | |
| 9 | Pulido de UI responsive + README + demo pública | |

## Arquitectura

Costo total del MVP: **$0, sin tarjeta de crédito en ningún proveedor.**

```
Frontend    Vite + React + Tailwind          →  Vercel Hobby (gratis)
Backend     Vercel Functions en /api/        →  Admin SDK de Firebase
Datos       Firestore (plan Spark)            →  1 GiB · 50k lecturas/día
Auth        Firebase Auth (Google + anónimo)  →  gratis
Mail        Brevo API                         →  300 mails/día
```

Dos builds desde un solo repo:

- `vite.config.ts` → `dist/` — panel + landing.
- `vite.widget.config.ts` → `public/widget/widget.js` → `dist/widget/widget.js` —
  el Web Component. **IIFE**, no ESM, para que un `<script src>` cross-origin
  funcione sin CORS.

`src/shared/` lo importan los dos builds: una sola lógica de negocio, dos
empaquetados.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completalo con tu config de Firebase
npm run dev                  # http://localhost:5173
```

Si querés probar el login contra los emuladores, en otra terminal:

```bash
npm run emuladores           # firestore :8080, auth :9099, UI :4000
# y en .env.local:  VITE_USAR_EMULADORES=si
```

### Variables de entorno

> **Sólo las variables con prefijo `VITE_` llegan al bundle del navegador.**
> Cualquier otra se queda en el servidor. Si creás una variable con prefijo
> `VITE_`, asumí que queda publicada en Internet.

En `.env.local` (desarrollo, nunca se sube): las cuatro `VITE_FIREBASE_*` y
`VITE_USAR_EMULADORES`.

En Vercel (`Settings → Environment Variables`):

| Variable | Para qué | ¿Secreta? |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Admin SDK en `/api/` | **Sí** |
| `BREVO_API_KEY` | envío de mail | **Sí** |
| `BREVO_SENDER_EMAIL` | remitente (tiene que estar verificado en Brevo) | No |
| `MERCADOPAGO_*` | Fase 5, vacío en el MVP | **Sí** |

Para el service account: descargalo de la consola de Firebase y pasalo por el
script, que lo aplana a una línea para que no se rompa al pegarlo:

```bash
node scripts/preparar-service-account.mjs ~/Descargas/proyecto.json
node scripts/preparar-service-account.mjs ~/Descargas/proyecto.json --write  # a .env.local
```

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en `:5173`. **No ejecuta `/api/`** |
| `npm run dev:api` | `vercel dev`: app + functions en un solo proceso |
| `npm run build` | Widget primero, después la app (así el widget entra en `dist/`) |
| `npm run typecheck` | `tsc -b` sobre `src/`, `api/`, `tests/` y las configs |
| `npm run lint` | oxlint |
| `npm run test:rules` | Emulador + 45 tests de reglas de seguridad |
| `npm run emuladores` | Emuladores de Firestore y Auth a mano (UI en `:4000`) |
| `npm run test` | typecheck + lint + reglas, en un comando |
| `npm run auth:admin` | Asigna el custom claim `admin` a un correo |
| `npm run svc:preparar` | Aplana el JSON del service account a una línea |

Para probar el backend en local hace falta `vercel dev` (o desplegar): Vite no
sabe ejecutar Vercel Functions, así que `/api/salud` devuelve el código fuente
del archivo.

## Fase 1 — Seguridad multi-tenant

En un SaaS la pregunta "¿este usuario puede ver esto?" tiene una sola respuesta
válida: **la que da el servidor**. Todo lo que corre en el navegador es del
visitante, y un visitante puede abrir la consola y llamar al SDK de Firebase a
mano. Así que el aislamiento no se programó en la app, se programó en
[`firestore.rules`](firestore.rules).

### Las tres invariantes

```
1. Un organizador sólo lee y escribe sus propios datos.
2. El cliente NUNCA escribe un /registros: eso lo hace el backend con el Admin SDK.
3. El interruptor del plan no lo puede tocar el propio cliente.
```

La tercera es la que se olvida. Si `plan` fuera editable, abrir la consola,
escribir `plan: 'pro+'` y listo: la restricción comercial de los planes no
vale nada. Por eso el update del organizador compara los campos privilegiados
contra su valor actual, y no alcanza con una lista blanca de campos editables.

### Cómo se prueba

45 tests contra el **Emulador de Firestore**, no contra el proyecto real:

```bash
npm run test:rules     # levanta el emulador, corre los tests y lo apaga
npm run emuladores     # o los emuladores a mano, con UI web en :4000
```

Salen de `node --test` (el runner nativo) y de `@firebase/rules-unit-testing`.
No hizo falta Vitest: Node 24 quita los tipos y ejecuta el `.ts` directo.

```
tests 45 · pass 45 · fail 0
```

El criterio de aceptación de la fase, escrito como código, es: *crear un
organizador B y confirmar que no puede ver los eventos de A*. Está en
`tests/rules/aislamiento.test.ts`, y hay test espejo para las dos direcciones
(por si el aislamiento fuera casualidad).

### Trampas del lenguaje de reglas, documentadas en el archivo

Las encontré todas por error, y son las que hacen que las reglas "no dejen
escribir nada" en vez de "no dejen escribir lo ajeno":

| Trampa | Qué pasa | Cómo se escribe bien |
|---|---|---|
| `request.auth.token.admin` sin el claim | **lanza error**, no devuelve `null`; el error deniega la regla entera | `'admin' in request.auth.token && ...` |
| `get(...).exists()` | compila y al evaluarse tira `Function not found: exists` | `get(...).data != null` |
| Función que devuelve un `get()` | el Document llega como `null` al llamador | `let d = get(...)` inline |
| `resource.data.campo` en un `list` sin filtro | `Property campo is undefined`, deniega el list | `resource.data.get('campo', null)` |
| Identificadores con `ñ` | el compilador no los tokeniza | `sinAcentos` |
| `affectedKeys().hasOnly([...])` con diff vacío | `hasOnly([])` es `true`: pasa un update que no cambia nada | comparar los campos privilegiados |

Las dos primeras son las que más rompen: hacen fallar **a los usuarios
legítimos**, no a los atacantes, y el error dice `PERMISSION_DENIED` sin más,
que manda a uno a buscar un bug de permisos donde el bug es de sintaxis.

### El super-admin es un claim, no un campo

`organizadores/{uid}.esAdmin` sería falsificable con un `updateDoc`. Un custom
claim vive dentro del ID token, que firma Firebase: el cliente no lo puede
escribir.

```bash
npm run auth:admin -- tu@correo.com        # asignar
npm run auth:admin -- tu@correo.com --quitar
```

El claim **no cambia la sesión actual**: el token ya emitido sigue siendo el
mismo. Hay que cerrar sesión y volver a entrar, o pedir un refresco con
`getIdTokenResult(user, true)`. La regla lo lee así:

```rules
function esSuperAdmin() {
  return estaAutenticado() && 'admin' in request.auth.token && request.auth.token.admin == true;
}
```

Ojo: `setCustomUserClaims` **reemplaza** todos los claims, no agrega. Con más
de un claim hay que leer los actuales y mergearlos, o al próximo login se
pierde el que falte sin que nadie se entere.

### La sincronía entre las reglas y el código

`firestore.rules` tiene el plan gratis hardcodeado, porque el lenguaje de reglas
no puede importar TypeScript. Son dos copias del mismo dato, y que se
desincronicen no es "tener cuidado": el test llama a
`nuevoDocumentoOrganizador()` — la función real que usa la app — y la manda
escribir contra las reglas. Si cambiás `LIMITES_POR_PLAN.gratis` y olvidás las
reglas, el test se pone rojo.

Por eso ese constructor está aislado en `src/services/organizadores.ts`: es
función pura, sin SDK de Firebase, para que el test la pueda importar.

### El guard de ruta no es seguridad

`src/app/components/Protegido.tsx` redirige a `/entrar` si no hay sesión. Es
UX. Si se borra ese componente o se mete un `<Link>` al panel, el usuario ve una
pantalla en blanco y **los datos siguen sin llegar**, porque las reglas los
cortan. Un guarda de ruta es comodidad; las reglas son seguridad.

### Emuladores

El emulador de Firestore necesita Java. En vez de instalar un JDK en el
máquina (una modificación del sistema que no tiene que ver con el repo), hay
un JRE 21 portable en `.tools/`, que `scripts/emuladores.mjs` localiza y le
pasa a `firebase-tools` por `JAVA_HOME`:

```bash
npm run emuladores        # firestore :8080, auth :9099, UI :4000
```

El script también detecta un Java del sistema y lo respeta: no pisa el entorno
de alguien que ya lo tiene bien. `.tools/` está en `.gitignore` (es un `.tar` de
50 MB que no es código).

Con `VITE_USAR_EMULADORES=si` en `.env.local`, el frontend apunta a los
emuladores y **el login con Google es simulado**: acepta cualquier correo y
devuelve nombre y foto fijos. Sirve para probar el flujo entero sin tocar la
consola de Firebase.

`--test-concurrency=1` en el script de tests no es una optimización: los dos
archivos de test comparten el mismo emulador, y `node --test` por defecto los
corre **en paralelo**, así que el `clearFirestore()` de uno borra los datos del
otro y los tests fallan con `NOT_FOUND` sin que haya un bug en las reglas.

## El patrón de theming

El requisito era "no clases Tailwind hardcodeadas por cliente". Se cumple con
dos familias de variables CSS:

```css
@theme {
  --color-primario: var(--c-primario); /* lo que entiende Tailwind */
}
:root {
  --c-primario: #2563eb;               /* lo que escribe el código */
}
```

```tsx
<div className="bg-primario" />   // ← la clase nunca cambia
```

```ts
aplicarTema({ colorPrimario: '#dc2626' }, elemento)
// → elemento.style.setProperty('--c-primario', '#dc2626')
```

El mismo componente, los mismos bytes de JS, aspecto distinto según el evento.
`aplicarTema` vive en `src/shared/theming.ts` y lo usan tanto la app como el
widget; además calcula solo si el texto sobre ese color va en blanco o en
oscuro (`colorDeTextoSobre`, contraste WCAG).

## Limitaciones conocidas del plan gratis

- **Vercel Hobby dice "uso personal, no comercial".** Para un portfolio o un
  MVP está bien. El día que se le cobre a un organizador real hay que migrar a
  Pro o a Cloud Functions: por eso el backend vive aislado en `api/`.
- **No hay Firebase Storage** (exige Blaze desde febrero de 2026), así que las
  imágenes se comprimen en el navegador y se guardan en documentos de Firestore
  aparte. Al migrar, es cambiar un archivo.
- **Brevo:** 300 mails/día y todos los correos llevan el pie "Sent with Brevo".
  No actives "Block unknown IP addresses" en la API key: los correos salen desde
  Vercel, con IPs dinámicas que no se pueden autorizar, y el envío se rompe de
  forma intermitente.
- **Firestore Spark:** sin Cloud Functions ni llamadas salientes. Por eso
  todo lo que necesite backend va por `/api/`.

## Advertencias de seguridad del propio repo

- **Nunca pongas claves reales en `.env.example`.** Es un archivo versionado, y
  el plan es publicar el repo. Si alguna vez entra una clave real ahí, está
  quemada: rotala en el panel del proveedor, no la borres del archivo.
- La `apiKey` de Firebase **no es un secreto** (viaja en el JS de cada
  visitante por diseño); la seguridad la dan las reglas. La de Brevo y el
  service account **sí lo son**, y por eso viven únicamente en variables de
  entorno de Vercel.
