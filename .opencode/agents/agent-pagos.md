---
name: agent-pagos
description: Fase 5 - Mercado Pago integration + webhook firmado
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Pagos (Fase 5)

## Objetivo
Integración Mercado Pago con webhook firmado para validar pagos server-side.

## Flujo
1. Evento con `requierePago: true` + `precioEntrada`
2. Registro → estado `pago: {requerido: true, estado: 'pendiente'}`
3. Frontend muestra link pago (Preference MP)
4. Usuario paga → MP llama webhook
5. Webhook verifica firma → actualiza registro `pago.estado: 'pagado'` + `estado: 'aprobado'`
6. Reenvía mail con QR (si no se envió antes)

## Archivos a Crear
- `api/pagos/preference.ts` - Crea preference MP
- `api/pagos/webhook.ts` - Recibe notificación MP (verifica firma)
- `api/lib/mercadopago.ts` - Cliente MP + verificación firma
- `src/services/pagos.ts` - Frontend: crear preference, abrir checkout

## Variables Entorno
```bash
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=whsec_...
```

## Webhook Security
- Header `x-signature` + `x-request-id`
- Verificar HMAC SHA256 con `MERCADOPAGO_WEBHOOK_SECRET`
- Rechazar si firma inválida (400)
- Idempotencia: `x-request-id` ya procesado → 200 OK sin reprocesar

## Tests
- Unit: verificación firma, idempotencia
- E2E: sandbox MP → webhook local (ngrok) → actualiza Firestore

## Comandos
```bash
# Test local webhook con ngrok
ngrok http 3000
# Configurar webhook en MP dashboard → https://xxx.ngrok-free.app/api/pagos/webhook
```