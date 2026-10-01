---
name: agent-eventos
description: CRUD eventos, branding, banner, límites de plan
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Eventos & Branding

## Responsabilidades
- CRUD eventos: crear, editar, listar, borrar, cambiar estado
- Branding del panel: color primario/secundario, logo (fase 3+)
- **Banner del evento**: `bannerUrl` (URL externa, validada)
- Límites por plan: `capacidadMaximaPorEvento`, `bannerPermitido`, `logoPermitido`
- Validación cliente + servidor (`validarBorrador` + reglas Firestore)

## Archivos Clave
- `src/app/pages/EventoForm.tsx` - Formulario crear/editar (con bannerUrl)
- `src/app/pages/Branding.tsx` - Editor branding panel
- `src/app/pages/Panel.tsx` - Lista eventos + botón copiar link
- `src/services/eventos.ts` - CRUD Firestore (web SDK)
- `src/services/documentoEvento.ts` - Construcción doc + validación pura
- `src/shared/types.ts` - Interfaces `Evento`, `BorradorEvento`, `LimitesPersonalizacion`

## Flujo Banner
1. Organizador pega URL en `EventoForm` (input type="url")
2. Validación: `new URL(url)`, protocolo http/https
3. Se guarda en `personalizacion.bannerUrl` via dot-notation en `actualizarEvento`
4. Landing pública (`EventoPublico.tsx`) muestra `<img src={bannerUrl}>`

## Tests
- `tests/unit/documentoEvento.test.ts` - Validación borrador
- `tests/rules/limites.test.ts` - Límites por plan
- `tests/rules/capacidad.test.ts` - Capacidad create/update

## Comandos
```bash
npm run test:unit -- tests/unit/documentoEvento.test.ts
npm run test:rules -- tests/rules/capacidad.test.ts
```