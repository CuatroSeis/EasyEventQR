---
name: agent-registros
description: Fase 6 - Panel registros, export CSV, reenvío mail, reconteo
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Panel Registros (Fase 6)

## Objetivo
Panel para organizador: ver reservas, exportar CSV, reenviar mail, reconteo cupo.

## Features
1. **Lista reservas** con búsqueda (nombre, email, DNI, estado)
2. **Export CSV** - `/api/registros/export?eventoId=xxx`
3. **Reenviar mail** - individual o masivo (`/api/registros/resend`)
4. **Reconteo cupo** - recalcula `evento.reservas` desde `registros/` (transacción)
5. **Alertas rebotados** - leer bounces Brevo API

## Archivos a Crear
- `src/app/pages/Registros.tsx` - UI panel (búsqueda, tabla, acciones)
- `api/registros.ts` - GET listado + filtros
- `api/registros/export.ts` - CSV download
- `api/registros/resend.ts` - Reenvío mail (individual/batch)
- `api/registros/recount.ts` - Reconteo atómico `reservas`
- `src/services/registros.ts` - Frontend services

## UI Registros
```
Tabla: Nombre | Email | DNI | Teléfono | Estado | Pago | Fecha | Acciones
Acciones: [Reenviar] [Ver QR] [Borrar]
Toolbar: Buscar | Exportar CSV | Reconteo | Reenviar todos
```

## Reconteo Lógica
```typescript
// Transacción atómica
const registros = await db.collection('registros')
  .where('eventoId', '==', eventoId)
  .where('estado', 'in', ['aprobado', 'pendiente'])
  .count().get()
await db.collection('eventos').doc(eventoId).update({
  reservas: registros.data().count
})
```

## Tests
- Unit: CSV generation, recount logic
- E2E: crear evento → 3 reservas → export CSV → reconteo → verifica contador

## Comandos
```bash
npm run dev               # Test UI en /panel/eventos/:id/registros
```