# Fase 10 — Verificación final y documentación (pendiente)

Este archivo documenta lo que resta de la **Fase 10** del plan de migración visual del estilo Hero a toda la web de EasyEventQR. Las fases 1 a 9 están completadas y verificadas.

## Objetivo

Validar que el estilo Hero se ve y funciona correctamente en todos los contextos reales de uso antes de considerar el trabajo de migración visual como finalizado.

## Tareas pendientes

### 1. Pruebas de responsividad (mobile-first)

Probar en pantallas móviles (apilamiento limpio, padding fluido, áreas táctiles de 44px) y escalar a desktop (grillas amplias, contenedores `max-w-lg`/`max-w-2xl`).

- [ ] Home (`/`): hero, sección buscar, "Cómo funciona", "Para quién", confianza.
- [ ] Landing evento (`/e/:eventoId`): encabezado, formulario, barra CTA fija móvil.
- [ ] Login (`/entrar`): formulario centrado, botón Google, enlace volver.
- [ ] Escaneo QR público (`/q/:token`): resultado válido/inválido, canvas QR.
- [ ] Operador puerta (`/operador/:token`): cámara, estados de resultado, botones táctiles.
- [ ] Paneles (`/panel/*`, `/admin/*`): tabla de eventos, registros, dashboard, organizadores, excepciones, auditoría.

### 2. `prefers-reduced-motion: reduce`

Verificar que las animaciones se desactivan cuando el usuario lo solicita:

- [ ] Glow pulso en `.ee-glow` y `.ee-glow::after` (Home y landings).
- [ ] Animación de flotación en `.ee-ticket` (Home hero).
- [ ] `animate-pulse` en estados de carga (paneles, operador).
- [ ] `animate-bounce-in` ya eliminado (anti-patrón de Impeccable).

### 3. Contraste WCAG AA

Verificar contraste mínimo 4.5:1 para texto normal y 3:1 para texto grande en fondos oscuros y claros:

- [ ] Fondo profundo `#0A0B12` + texto blanco/gris claro.
- [ ] Superficies translúcidas `--ee-superficie-clara` + texto oscuro en modo claro.
- [ ] Bordes `--ee-borde-claro` + fondos en modo claro.
- [ ] Badges de estado (`bg-ee-acento/10 text-ee-acento-texto`).

### 4. Build y typecheck

- [ ] `npx tsc -b` limpio sin errores.
- [ ] `npx vite build` exitoso sin errores de compilación.
- [ ] `npx oxlint` sin errores nuevos (solo advertencias preexistentes).

### 5. Detector Impeccable

- [ ] `impeccable detect --json` en todos los archivos modificados → sin hallazgos.

## Archivos modificados en la migración (fases 1-9)

- `src/styles/index.css` — Tokens `--ee-*`, clases `.ee-tarjeta-premium`, `.ee-tarjeta-paso`, `.ee-titulo-seccion`, `.ee-subtitulo-seccion`, `.ee-seccion`, `.ee-textura`, `.ee-borde-activo`.
- `src/app/pages/Home.tsx` — Hero, sección buscar, cómo funciona, para quién, confianza, footer.
- `src/app/pages/EventoPublico.tsx` — Marco, encabezado, organizador, precio, CTA, formulario, confirmación.
- `src/app/pages/Login.tsx` — Main, título, botón Google, mensajes, enlace volver.
- `src/app/pages/QrPublico.tsx` — Main, badges, canvas QR, textos.
- `src/app/pages/Operador.tsx` — Todos los estados (verificando, error_token, error_permiso, valido, ya_usado, invalido).
- `src/app/components/PanelLayout.tsx` — Wrapper, header, barra inferior.
- `src/app/components/EmptyState.tsx` — Tarjeta premium + CTA.
- `src/app/pages/Panel.tsx` — Título, error, resumen, tarjeta evento, Cargando.
- `src/app/pages/admin/*.tsx` — Dashboard, MensajeError, Cargando, Organizadores, Eventos, Registros, Auditoría, Excepciones.
- `src/shared/i18n.ts` — Nueva clave `home.buscar.subtitulo`.
- `index.html` — Fuente Inter agregada.
- `DESIGN.md` — Estándar Hero documentado como referencia para toda la web.

## Cómo continuar en la próxima sesión

1. Abrir el proyecto en `/home/rufino/Desktop/Propios/EasyEventQR/EasyEventQR`.
2. Ejecutar las pruebas de responsividad y contraste listadas arriba.
3. Ejecutar `npx tsc -b`, `npx vite build` y `impeccable detect --json`.
4. Si todo pasa, marcar la Fase 10 como completada en `DESIGN.md`.

---
Generado el 17 de noviembre de 2026 (sesión finalizada por el usuario).