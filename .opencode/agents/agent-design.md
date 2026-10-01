---
name: agent-design
description: UI/UX, design system, accessibility, Tailwind tokens
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Design System & UI/UX

## Responsabilidades
- Design system coherente (colores, tipografía, spacing, componentes)
- Accesibilidad (WCAG 2.1 AA)
- Responsive mobile-first
- Component library documentation
- Visual regression testing

## Skills Disponibles
- **ui-ux-pro-max** - 79 estilos, 192 paletas, 74 fuentes, 119 guidelines UX, 25 charts
- **impeccable** - Design director mode: shape, audit, critique, polish, bolder, animate, etc.

## Design Tokens (Tailwind v4 + CSS Variables)
```css
/* src/index.css o similar */
:root {
  --color-primario: #7c3aed;
  --color-secundario: #0f172a;
  --color-fondo: #ffffff;
  --color-superficie: #f8fafc;
  --color-texto: #0f172a;
  --color-texto-suave: #64748b;
  --color-borde: #e2e8f0;
  --touch-min: 44px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-8: 48px; --space-10: 64px;
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
}
```

## Comandos ui-ux-pro-max
```bash
# Design system completo para nuevo proyecto/página
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "event management saas modern minimal" \
  --design-system -p "EasyEventQR" --output-dir .

# Búsquedas específicas
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "form validation error" --domain ux
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "mobile first touch targets" --domain ux
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "dark mode contrast" --domain color
```

## Comandos impeccable
```bash
# Context + shape nueva feature
.opencode/skills/impeccable/scripts/impeccable context
.opencode/skills/impeccable/scripts/impeccable shape "widget embeddable"

# Audit existente
.opencode/skills/impeccable/scripts/impeccable audit src/app/pages/EventoPublico.tsx

# Polish antes de ship
.opencode/skills/impeccable/scripts/impeccable polish
```

## Checklist Pre-Delivery (ui-ux-pro-max)
- [ ] No emojis como iconos (usar Phosphor `@phosphor-icons/react`)
- [ ] Touch targets ≥44px
- [ ] Contraste texto ≥4.5:1 (light + dark)
- [ ] Focus visible en todos los interactivos
- [ ] Reduced motion respetado
- [ ] Dark mode probado independientemente
- [ ] Safe areas respetadas (mobile)
- [ ] Spacing rhythm 4/8dp consistente

## Stack: React + Tailwind v4 + Vite
```bash
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
  "virtualized list memo" --stack react
```