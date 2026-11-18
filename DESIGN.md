# EasyEventQR — Diseño y Marca Personal

Este documento define la identidad visual de EasyEventQR y la paleta de colores que se aplica en **todos los endpoints** de la web (`/`, `/panel`, `/admin`, `/e/:eventoId`, `/operador/:token`, etc.). El sistema de theming vive en `src/styles/index.css` y usa variables CSS `--c-*` que se mapean a clases Tailwind (`--color-*`). Cambiar un valor en `:root` lo refleja en toda la app sin tocar componentes individuales.

El **estilo estético de referencia** es el **Hero** de la landing pública (`/`): fondo oscuro profundo, glows difusos (azul eléctrico + violeta) para profundidad, gradientes vibrantes, tarjetas con elevación y backdrop-filter, y tipografía jerárquica (Bebas Neue solo en el logotipo, Inter en todo el cuerpo). **Este estilo es el estándar para toda la web** y se extiende progresivamente a todos los endpoints.

---

## Paleta de marca

### Tokens globales (`--c-*`)

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

> Nota: `#F8FAFC` es el fondo de marca (slate-50). Las tarjetas y componentes heredan este fondo y se delimitan con `--c-borde`.

### Tokens de la landing pública (`--ee-*`)

Estos tokens definen el **estilo Hero** (fondo oscuro profundo, glows, superficies translúcidas, bordes definidos) y se aplican a toda la landing pública (`/`). Soportan ambos modos (claro y oscuro) con profundidad y textura en cada uno.

| Token | Valor (claro) | Valor (oscuro) | Uso |
|-------|---------------|----------------|-----|
| `--ee-fondo` | `#0A0B12` | `#0A0B12` | Fondo profundo de la home (casi negro azulado), idéntico en ambos modos |
| `--ee-acento` | `#2563EB` | `#60A5FA` | Acento principal (glow, bordes activos, gradiente CTA) |
| `--ee-acento-violeta` | `#7C3AED` | `#A855F7` | Segundo color del gradiente CTA primario |
| `--ee-acento-suave` | `rgba(37,99,235,0.16)` | `rgba(96,165,250,0.14)` | Sombra suave de acento en hover |
| `--ee-acento-texto` | `#FFFFFF` | `#FFFFFF` | Texto e iconos sobre fondo de acento |
| `--ee-superficie` | `rgba(30,41,59,0.5)` | `rgba(15,23,42,0.5)` | Superficie translúcida de tarjetas premium (modo oscuro) |
| `--ee-superficie-clara` | `rgba(255,255,255,0.7)` | `rgba(30,41,59,0.6)` | Superficie más clara para tarjetas en modo claro |
| `--ee-borde` | `rgba(148,163,184,0.22)` | `rgba(30,41,59,0.75)` | Borde sutil de tarjetas e inputs (modo oscuro) |
| `--ee-borde-claro` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.08)` | Borde definido para modo claro |
| `--ee-texto-suave` | `#94A3B8` | `#CBD5E1` | Texto de apoyo en la home |
| `--ee-glow` | `rgba(37,99,235,0.4)` | `rgba(96,165,250,0.32)` | Glow azul eléctrico difuso |
| `--ee-glow-violeta` | `rgba(124,58,237,0.25)` | `rgba(168,85,247,0.22)` | Glow violeta secundario para dimensión |

---

## Tipografía

| Token | Fuente | Uso |
|-------|--------|-----|
| `--font-sans` | `'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | Cuerpo, subtítulos, inputs, botones, párrafos (todo menos el logotipo) |
| `--font-display` | `'Bebas Neue', 'Source Sans 3', system-ui, sans-serif` | Logotipo principal (**EASYEVENTOR**) y títulos grandes (H1 hero) |

**Regla:** La tipografía pesada (Bebas Neue) se reserva exclusivamente para el logotipo principal. Todo lo demás usa Inter para garantizar legibilidad y jerarquía clara.

### Jerarquía tipográfica de secciones

| Clase | Uso |
|-------|-----|
| `.ee-titulo-seccion` | Títulos de sección (h2): fuente display, peso 700, tracking ajustado, tamaño elevado |
| `.ee-subtitulo-seccion` | Subtítulos de sección: fuente sans, peso 500, mayúsculas, espaciado de letra, color suave |

---

## Reglas de aplicación por endpoint

### `/` — Home (landing pública) — ESTÍNDAR DE REFERENCIA (Hero)

El fondo oscuro profundo (`.ee-fondo`) y los glows (`.ee-glow`) se aplican al `<main>` completo, no solo al header del Hero, para que la profundidad y textura se mantengan al scrollear por toda la página.

- **Fondo:** oscuro profundo (`--ee-fondo`) + granulado sutil (`.ee-textura`) + dos glows difusos (azul eléctrico `--ee-glow` y violeta `--ee-glow-violeta`) para sensación de profundidad.
- **Logotipo:** **EASYEVENTOR** en `font-display` (Bebas Neue).
- **Subtítulo, bajada, inputs, botones y párrafos:** en `font-sans` (Inter).
- **CTA principal:** gradiente vibrante azul → violeta (`--ee-acento` → `--ee-acento-violeta`), sombra base y glow intenso en hover.
- **CTA secundario:** borde definido (`border-ee-borde-claro`) y fondo translúcido para destacar sobre el fondo oscuro.
- **Tarjetas premium:** `.ee-tarjeta-premium` (superficie diferenciada, borde definido, sombra difuminada, backdrop-filter, elevación en hover).
- **Tarjetas de paso:** `.ee-tarjeta-paso` (versión compacta para pasos de "Cómo funciona").
- **Números de paso:** `.ee-paso-numero` con gradiente azul → violeta.
- **Mockup de ticket digital:** borde con muescas, sombra flotante, animación de flotación y contenedor con glow alrededor del código QR.

### `/buscar` y secciones de resultados de la home

- Sección envuelta en `.ee-seccion` (padding fluido, espacio entre secciones, mobile-first).
- Contenedor del formulario en `.ee-tarjeta-premium` con textura (`.ee-textura`).
- Inputs con borde `border-ee-borde` y fondo `bg-ee-superficie`.
- Botón primario con `ee-boton-primario` (gradiente + glow).
- Botones secundarios con `ee-boton-secundario`.
- Tarjetas de resultados con `ee-tarjeta-premium`.
- Títulos de sección con `.ee-titulo-seccion` y `.ee-subtitulo-seccion`.

### `/panel` — Panel del organizador (estilo Hero aplicado)

- Hereda automáticamente los tokens de `:root` (paleta `--c-*`).
- Barra fija inferior con botón principal "Crear" en `ee-boton-primario` (gradiente azul→violeta, glow en hover).
- Barra superior con botones secundarios en `ee-boton-secundario` (borde definido, fondo translúcido).
- Tarjetas de eventos con `ee-tarjeta` (superficie translúcida, borde sutil, elevación, backdrop-filter).
- Tarjetas de resumen (métricas) con `ee-tarjeta`.
- Botones de acción (copiar link, escanear, registros) con `ee-boton-primario` / `ee-boton-secundario`.
- Tipografía: `ee-sans` (Inter) en todo el cuerpo del panel.
- Estado de evento abierto usa `--ee-acento` (fondo del badge) en lugar de `--c-primario`.

### `/admin` — Panel de super-admin (estilo Hero aplicado)

- Misma paleta de marca. Los tokens globales `--c-*` aplican para personalización.
- Tarjetas de métricas del dashboard con `ee-tarjeta`.
- Tablas de organizadores, eventos, registros y auditoría con `ee-tarjeta` (superficie translúcida, elevación).
- Theads de tablas con `bg-ee-superficie` y texto `text-ee-texto-suave`.
- Botones de acción (conceder, revocar, cerrar/reabrir, exportar, paginación) con `ee-boton-primario` / `ee-boton-secundario`.
- Badges de estado con `bg-ee-acento/10` y `text-ee-acento-texto`.
- Modales con `ee-tarjeta`.
- Tipografía: `ee-sans` (Inter) en todo el cuerpo del admin.
- Estados vacíos con `ee-tarjeta`.

### `/e/:eventoId` — Landing pública del evento

- Puede sobreescribir colores desde Firestore (tema del organizador). Si no hay tema personalizado, usa los valores por defecto de esta marca.
- **Pendiente de migración:** aplicar fondo oscuro + glows y tarjetas con elevación para mantener consistencia con el Hero.

### `/operador/:token` — Escaneo en puerta

- Hereda la paleta. El foco visible usa `--c-primario`.
- **Pendiente de migración:** adaptar contrastes al fondo oscuro si se usa en modo oscuro.

### `/panel/cuenta` — Mi cuenta / marca

- Aquí el organizador puede subir su propio logo y elegir colores personalizados. Ese tema se guarda en Firestore y pisa `--c-*` en runtime vía `aplicarTema`. Los valores de `DESIGN.md` son los **por defecto** antes de cualquier personalización.

---

## Plan de fix y upgrade visual (estilo Hero → toda la web)

Este plan abarca las inconsistencias detectadas entre el hero (estilo de referencia) y el resto de la web (sección buscar, pasos "Cómo funciona", paneles, etc.).

### Fase 1 — Consolidar el estándar Hero (completado)

- [x] `index.html`: fuente Inter agregada vía Google Fonts.
- [x] `src/styles/index.css`:
  - Tokens `--ee-*` definidos (fondo, acento, violeta, glows, superficie, borde, superficie-clara, borde-claro).
  - `.ee-fondo`: fondo oscuro profundo + granulado sutil.
  - `.ee-glow` y `.ee-glow::after`: dos glows difusos con animación de pulso.
  - `.ee-tarjeta`: superficie translúcida, borde sutil, `border-radius: 1rem`, `backdrop-filter: blur(10px)`, elevación base y hover con `translateY(-4px)`.
  - `.ee-ticket`: borde con muescas, sombra flotante, animación de flotación (`ee-ticket-flote`), glow en hover.
  - `.ee-sans`: tipografía Inter para cuerpo/interfaz.
  - `.ee-boton-primario`: gradiente azul → violeta, sombra base, hover con `brightness(1.1)`, `translateY(-2px)` y glow intenso.
  - `.ee-boton-secundario`: borde definido, fondo translúcido, hover con borde de acento y sombra.
- [x] `src/app/pages/Home.tsx`:
  - Hero con título en Bebas Neue, bajada en Inter, CTA primario/secundario con nuevas clases.
  - Ticket con QR visual (glow de fondo, borde, tamaño mayor).
  - Fondo y glows movidos al `<main>` completo para profundidad en toda la página.

### Fase 2 — Fix de inconsistencias en la home (sección buscar y pasos) — [COMPLETADA]

- [x] **Sección "Buscar evento"**: formulario envuelto en `ee-tarjeta-premium`, sección con `ee-seccion ee-textura`, input con `border-ee-borde bg-ee-superficie`, focus con `outline-ee-acento`.
- [x] **Botón "Buscar evento"**: `ee-boton-primario` (gradiente + glow) + `ee-sans`.
- [x] **Tarjetas de resultados de búsqueda**: `ee-tarjeta-premium` con `ee-sans`.
- [x] **Botones de error** (reintentar, buscar por nombre, crear evento): `ee-boton-secundario`.
- [x] **Línea conectora de pasos**: usa `--ee-borde-claro` via `bg-ee-borde-claro`.
- [x] **Encabezados de secciones**: `ee-titulo-seccion` y `ee-subtitulo-seccion` en lugar de `font-display`.

### Fase 3 — Migración del estilo Hero a paneles (`/panel`, `/admin`) — [COMPLETADA]

- [x] **PanelLayout**: barra inferior con `ee-boton-primario`, barra superior con `ee-boton-secundario`, `ee-sans` en todo el layout.
- [x] **Panel.tsx**: mensaje error (`ee-tarjeta`), tarjetas de resumen (`ee-tarjeta`), tarjetas de evento (`ee-tarjeta`), botones copiar/QR/registros (`ee-boton-secundario`), botón escanear (`ee-boton-primario`), estado abierto con `bg-ee-acento`.
- [x] **EmptyState**: `ee-tarjeta`, `ee-boton-primario`, `ee-sans`.
- [x] **DashboardTab**: tarjetas métricas (`ee-tarjeta`), `ee-sans`.
- [x] **OrganizadoresTab**: contenedor tabla (`ee-tarjeta`), thead `bg-ee-superficie`, botones (`ee-boton-secundario`), `ee-sans`.
- [x] **MensajeError**: `ee-tarjeta`, `ee-sans`.
- [x] **Cargando**: `border-ee-borde`, `bg-ee-superficie/50`.
- [x] **EventosTab**: tabla (`ee-tarjeta`), thead `bg-ee-superficie`, botón cerrar/reabrir (`ee-boton-secundario`), estado vacío (`ee-tarjeta`), `ee-sans`.
- [x] **RegistrosTab**: botón exportar (`ee-boton-secundario`), tabla (`ee-tarjeta`), paginación (`ee-boton-secundario`), estado vacío (`ee-tarjeta`), `ee-sans`.
- [x] **AuditoriaTab**: tabla (`ee-tarjeta`), badge acción (`bg-ee-acento/10`), estado vacío (`ee-tarjeta`), `ee-sans`.
- [x] **ExcepcionesTab**: botón conceder (`ee-boton-primario`), tabla (`ee-tarjeta`), modal (`ee-tarjeta`), botones modal (`ee-boton-secundario`, `ee-boton-primario`), estado vacío (`ee-tarjeta`), `ee-sans`.

### Fase 4 — Refactorización de secciones inferiores del Home — [COMPLETADA]

- [x] **Todas las secciones inferiores**: envueltas en `ee-seccion` con padding fluido y `ee-textura` para profundidad en modo claro.
- [x] **Títulos de sección**: `ee-titulo-seccion` (fuente display, peso 700) y `ee-subtitulo-seccion` (Inter, mayúsculas, color suave).
- [x] **Tarjetas unificadas**: `ee-tarjeta-premium` en lugar de `ee-tarjeta` o clases Tailwind planas, con borde definido y sombra difuminada en ambos modos.
- [x] **Tarjetas de pasos**: `ee-tarjeta-paso` con números de paso en gradiente azul→violeta (`ee-paso-numero`).
- [x] **Acentos de color**: gradientes azul→violeta en bordes activos (`ee-borde-activo`) y enlaces secundarios.
- [x] **Modo claro con profundidad**: `ee-superficie-clara`, `ee-borde-claro`, `ee-textura` para evitar aspecto plano.

### Fase 5 — Migración a landings públicas de eventos (`/e/:eventoId`)

- [ ] Aplicar fondo oscuro + glows cuando el evento no tenga tema personalizado de Firestore.
- [ ] Tarjetas de información del evento con `ee-tarjeta-premium` y elevación.
- [ ] Botones de acción (reservar, compartir) con `ee-boton-primario` / `ee-boton-secundario`.

### Fase 6 — Migración al operador de puerta (`/operador/:token`)

- [ ] Adaptar contrastes y focos al fondo oscuro para legibilidad en modo escaneo.
- [ ] Mantener accesibilidad (foco visible, contraste mínimo WCAG AA).

### Fase 7 — Documentación y pruebas

- [x] Actualizar `DESIGN.md` con cada cambio aprobado (este documento).
- [ ] Probar en móvil (responsividad): `sm:flex-row`, `sm:grid-cols-2`, `hidden sm:block`, etc.
- [ ] Probar `prefers-reduced-motion`: animaciones de glows y ticket desactivadas.
- [ ] Verificar contraste WCAG AA en fondos oscuros y claros para texto y bordes.
- [ ] Build y typecheck limpios tras cada fase.

---

## Cómo se aplica técnicamente

1. `src/styles/index.css` define `:root` con los valores por defecto de `--c-*` y `--ee-*`.
2. `@theme` mapea cada `--color-*` a `var(--c-*)`.
3. Los componentes usan clases Tailwind como `bg-primario`, `text-secundario`, `border-borde`, etc. Nunca colores hardcodeados.
4. Los componentes de la home usan clases de utilidad `.ee-*` (`.ee-fondo`, `.ee-glow`, `.ee-tarjeta`, `.ee-ticket`, `.ee-sans`, `.ee-boton-primario`, `.ee-boton-secundario`, `.ee-tarjeta-premium`, `.ee-tarjeta-paso`, `.ee-titulo-seccion`, `.ee-subtitulo-seccion`, `.ee-seccion`, `.ee-textura`, `.ee-borde-activo`) definidas en `src/styles/index.css`.
5. Si un organizador personaliza su marca desde `/panel/cuenta`, `aplicarTema()` escribe `setProperty('--c-primario', nuevoColor)` en `:root`, y toda la app reacciona sin recargar.

---

## Archivos relacionados

- `src/styles/index.css` — Tokens por defecto, theming y clases `.ee-*` del estilo Hero
- `src/app/pages/Home.tsx` — Aplicación directa del estilo Hero en la landing
- `src/app/App.tsx` — Rutas y estructura de endpoints
- `index.html` — Fuentes (Bebas Neue + Inter) y metadatos
- `public/Screenshot1.jpeg` — Referencia visual: Hero (estilo objetivo)
- `public/Screenshot2.jpeg` — Referencia visual: sección buscar y pasos (migrada al estilo Hero)