---
name: agent-escanner
description: Fase 7 - QR Scanner + link temporal operador (transacción atómica)
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Escáner QR + Operador (Fase 7)

## Objetivo
Validación de entrada en puerta: escaneo QR → marca `usado: true` atómicamente.

## Flujo
1. Operador accede a link temporal firmado: `/operador/<signed-token>`
2. Link expira (ej: 4 horas), firmado con secret server
3. Página escáner: cámara → lee QR → extrae token
4. POST `/api/validar-uso` → transacción: `usado: false` → `usado: true, fechaUso: now`
5. Resultado: ✓ Entrada válida / ✕ Ya usado / ✕ Inválido

## Archivos a Crear
- `src/app/pages/Operador.tsx` - Página escáner (camera API)
- `api/operador/link.ts` - Genera link firmado (JWT o HMAC)
- `api/operador/validar.ts` - Valida link + escanea QR
- `api/validar-uso.ts` - Transacción atómica `usado`
- `src/lib/qr-scanner.ts` - Wrapper html5-qrcode o similar

## Seguridad
- **Transacción atómica**: `runTransaction` → `get(registro)` → si `usado=false` → `update({usado: true, fechaUso: now})`
- **Link operador**: JWT con `exp`, `eventoId`, `operadorId`, firmado con `OPERADOR_SECRET`
- **Rate limit** en validación de uso

## QR Data
```json
{
  "t": "token-base64url",
  "eventoId": "abc123"
}
```
URL: `/q/{token}?eventoId=xxx`

## Tests
- Unit: transacción atómica (concurrencia 2 escaneos mismo QR → solo 1 OK)
- Unit: JWT link generation + validation + expiry
- E2E: 2 dispositivos escanean mismo QR simultáneo

## Comandos
```bash
npm run dev               # Test en /operador/<token>
```