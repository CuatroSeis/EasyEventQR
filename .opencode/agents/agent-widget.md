---
name: agent-widget
description: Fase 4 - Web Component embebible <ticket-widget> Shadow DOM
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Widget Embebible (Fase 4)

## Objetivo
Web Component `<ticket-widget>` que cualquier organizador puede embeber en su web:
```html
<script src="https://easyeventqr.vercel.app/widget/widget.js"></script>
<ticket-widget evento-id="abc123"></ticket-widget>
```

## Requisitos Técnicos
- **Shadow DOM** - Aislamiento total de estilos
- **Bundle IIFE** - `vite.widget.config.ts` → `dist/widget/widget.js`
- **Props**: `evento-id` (requerido), `theme` (opcional)
- **Auto-hidratación**: Fetch `/api/evento-publico?id=` + render formulario
- **Mismo diseño** que landing pública (`EventoPublico.tsx`)

## Archivos Clave
- `vite.widget.config.ts` - Config build IIFE
- `src/widget/` - Nuevo entry point (crear)
- `public/widget/widget.js` → `dist/widget/widget.js`
- `src/shared/theming.ts` - `aplicarTema()` ya acepta `RaizCss` (shadowRoot)

## Arquitectura Widget
```
widget.ts (entry)
  → defineCustomElement('ticket-widget')
  → connectedCallback():
      - this.attachShadow({mode: 'open'})
      - fetch /api/evento-publico?id=${this.getAttribute('evento-id')}
      - render en shadowRoot con estilos inyectados
      - form submit → /api/registro
      - éxito → muestra confirmación en shadowRoot
```

## Estilos en Shadow DOM
```typescript
// En connectedCallback
const style = document.createElement('style')
style.textContent = `
  :host { display: block; font-family: inherit; }
  .campo { ... }  /* mismos estilos que app */
  /* variables CSS via aplicarTema(shadowRoot) */
`
shadowRoot.appendChild(style)
aplicarTema(evento.personalizacion, shadowRoot)
```

## Tests
- Unit: render en shadow DOM, form submit, theme
- E2E: página HTML externa + script widget → funciona

## Comandos
```bash
npm run build:widget     # Genera dist/widget/widget.js
npm run build            # Incluye widget
```