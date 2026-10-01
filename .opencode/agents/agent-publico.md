---
name: agent-publico
description: Landing pública, registro, QR validation, mail
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Flujo Público (Landing + Registro + QR)

## Responsabilidades
- **Landing `/e/:eventoId`**: Banner, info evento, formulario registro
- **Registro `POST /api/registro`**: DNI obligatorio, fecha nac ≥18 años, transacción atómica
- **QR Validation `/q/:token`**: Valida entrada en puerta
- **Mail Brevo**: Envío QR + datos evento (fallback consola si sin API key)
- **Rate limiting**: IP-based (1min/1h/1d) + honeypot `sitioWeb`

## Archivos Clave

### Frontend
- `src/app/pages/EventoPublico.tsx` - Landing + formulario
  - Campos: nombre, email, **dni (7-8 dígitos)**, **fechaNacimiento (date, max=today-18años)**, teléfono (opcional)
  - Validación HTML5 + servidor
- `src/app/pages/QrPublico.tsx` - Pantalla validación QR
  - `noindex`, no muestra token, solo ✓/✕ + mensaje

### Backend (`api/`)
- `api/registro.ts` - Endpoint principal
  - Validación Zod (`api/lib/validacion.ts`)
  - Transacción: crea `registros/{qrHash}` + incrementa `evento.reservas`
  - Mail async (no bloquea transacción)
- `api/validar-qr.ts` - Solo lectura, `getDoc` por `qrHash`
- `api/evento-publico.ts` - Datos landing (sin auth)
- `api/lib/validacion.ts` - Esquema Zod + validación ≥18 años
- `api/lib/email.ts` - Construcción mail (puro, testeable)
- `api/lib/mail.ts` - Envío Brevo (único `fetch`)
- `api/lib/qr.ts` - Token 192-bit, SHA-256, QR PNG data URL
- `api/lib/cupo.ts` - Rate limiting IP

## Data Flow Registro
```
POST /api/registro
  → validarRegistro() → {ok, datos: {dni, fechaNacimiento, ...}}
  → esTrampa(honeypot) → 200 fake si bot
  → rateLimit IP → 429 si excede
  → transacción Firestore:
      tx.create(registros/{qrHash}, {dni, fechaNacimiento, qrHash, ...})
      tx.set(evento, {reservas: FieldValue.increment(1)})
  → enviarMail() async (Brevo o consola)
  → 201 {ok, evento, estado, pagoRequerido}
```

## Tests
- `tests/unit/validacion.test.ts` - 13 tests (DNI, fechaNac, mayorEdad, honeypot)
- `tests/rules/registros.test.ts` - Aislamiento, solo server escribe
- E2E manual: crear evento → reservar → mail → QR → validar

## Comandos
```bash
npm run test:unit -- tests/unit/validacion.test.ts
npm run test:rules -- tests/rules/registros.test.ts
npm run dev:api           # Test local completo con emulador
```