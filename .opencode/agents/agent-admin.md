---
name: agent-admin
description: Panel Super-admin, gestión organizadores, planes
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Super-Admin Panel

## Responsabilidades
- Panel `/admin` - Solo accesible por super-admin (claim `admin`)
- Lista organizadores con: nombre, email, UID, plan, estado, fecha alta, cupo máx
- Cambio de plan: Gratis / Pro / Pro+ (actualiza `plan` + `limitesPersonalizacion`)
- Endpoint `/api/admin-organizadores` (GET + PATCH)
- Verificación admin via `/api/me` (no variable `VITE_` en frontend)

## Archivos Clave
- `src/app/pages/AdminPanel.tsx` - UI tabla + botones plan
- `api/admin-organizadores.ts` - Endpoints GET/PATCH
- `api/me.ts` - Verifica token Firebase + `isAdmin`
- `src/app/App.tsx` - Ruta `/admin` dentro de `<Protegido>`

## Flujo Autorización
```
Frontend (AdminPanel)
  → GET /api/me → {isAdmin: true}
  → Si false → redirect /panel
  → GET /api/admin-organizadores (header Authorization)
  → PATCH /api/admin-organizadores?uid=xxx (header Authorization)
```

## Variables Entorno
- **Backend only**: `SUPER_ADMIN_UID` (Vercel Environment Variables)
- **NO** `VITE_SUPER_ADMIN_UID` (expondría UID en bundle)

## Planes y Límites
```typescript
gratis:  { banner: false, color: true,  logo: false, capacidad: 100 }
pro:     { banner: true,  color: true,  logo: false, capacidad: 1000 }
pro+:    { banner: true,  color: true,  logo: true,  capacidad: 5000 }
```

## Tests
- `tests/rules/super-admin.test.ts` - Reglas claim admin
- Unit: `admin-organizadores.test.ts` (pendiente)

## Comandos
```bash
npm run test:rules -- tests/rules/super-admin.test.ts
npm run dev               # Test UI en localhost:5173/admin
```