# EasyEventQR — Diseño y Marca Personal

Este documento define la identidad visual de EasyEventQR y la paleta de colores que se aplica en **todos los endpoints** de la web (`/`, `/panel`, `/admin`, `/e/:eventoId`, `/operador/:token`, etc.). El sistema de theming vive en `src/styles/index.css` y usa variables CSS `--c-*` que se mapean a clases Tailwind (`--color-*`). Cambiar un valor en `:root` lo refleja en toda la app sin tocar componentes individuales.

---

## Paleta de marca

| Token | Valor | Uso |
|-------|-------|-----|
| `--c-primario` | `#2563EB` | Botones principales, enlaces de acción, foco, acento principal |
| `--c-secundario` | `#334155` | Texto secundario, iconografía, patrones de fondo, CTA secundario sutil |
| `--c-superficie` | `#F8FAFC` | Fondo general de la aplicación (body y superficie base) |
| `--c-texto` | `#0F172A` | Texto principal, títulos, contenido de lectura |
| `--c-texto-suave` | `#475569` | Texto de apoyo, subtítulos, descripciones secundarias |
| `--c-borde` | `#E2E8F0` | Bordes de tarjetas, inputs, delimitadores |
| `--c-sobre-primario` | `#FFFFFF` | Texto e iconos sobre fondo primario |
| `--c-error` | `#DC2626` | Estados de error, alertas |

> Nota: `#F8FAFC` es el fondo de marca (slate-50). Las tarjetas y componentes heredan este fondo y se delimitan con `--c-borde`, por lo que no es necesario un fondo blanco separado.

---

## Tipografía

| Token | Fuente | Uso |
|-------|--------|-----|
| `--font-sans` | `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Cuerpo, interfaz, lectura |
| `--font-display` | `'Bebas Neue', 'Source Sans 3', system-ui, sans-serif` | Títulos grandes, marca (H1 hero) |

---

## Reglas de aplicación por endpoint

### `/` — Home (landing pública)
- Patrón QR de fondo en el hero usando `--c-secundario` con opacidad muy baja.
- CTA principal ("Tengo un código") en `--c-primario`.
- CTA secundario ("Crear mi evento") con fondo sutil de `--c-secundario` y borde.
- Tarjetas de resultados con borde `--c-borde` y sombra suave.

### `/panel` — Panel del organizador
- Hereda automáticamente los tokens de `:root`.
- Barra fija inferior, tarjetas de eventos y inputs usan `--c-superficie`, `--c-borde`, `--c-texto`.

### `/admin` — Panel de super-admin
- Misma paleta de marca. No requiere tema aparte; los tokens globales aplican.

### `/e/:eventoId` — Landing pública del evento
- Puede sobreescribir colores desde Firestore (tema del organizador). Si no hay tema personalizado, usa los valores por defecto de esta marca.

### `/operador/:token` — Escaneo en puerta
- Hereda la paleta. El foco visible usa `--c-primario`.

### `/panel/cuenta` — Mi cuenta / marca
- Aquí el organizador puede subir su propio logo y elegir colores personalizados. Ese tema se guarda en Firestore y pisa `--c-*` en runtime vía `aplicarTema`. Los valores de `DESIGN.md` son los **por defecto** antes de cualquier personalización.

---

## Cómo se aplica técnicamente

1. `src/styles/index.css` define `:root` con los valores por defecto de `--c-*`.
2. `@theme` mapea cada `--color-*` a `var(--c-*)`.
3. Los componentes usan clases Tailwind como `bg-primario`, `text-secundario`, `border-borde`, etc. Nunca colores hardcodeados.
4. Si un organizador personaliza su marca desde `/panel/cuenta`, `aplicarTema()` escribe `setProperty('--c-primario', nuevoColor)` en `:root`, y toda la app reacciona sin recargar.

---

## Archivos relacionados

- `src/styles/index.css` — Tokens por defecto y theming
- `src/app/pages/Home.tsx` — Aplicación directa de la marca en la landing
- `src/app/App.tsx` — Rutas y estructura de endpoints