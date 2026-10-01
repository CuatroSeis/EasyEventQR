---
name: agent-auth
description: Firebase Auth, Claims, Super-admin logic
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Auth & Authorization

## Responsabilidades
- Firebase Auth configuration (Google provider, Anonymous Auth fase 3.5)
- Custom claims: `admin` para super-admin
- Endpoint `/api/me` - verifica token y devuelve `isAdmin`
- Reglas Firestore: claim `admin` cruza aislamiento
- Login flow: `/entrar` → Google OAuth → redirect `/panel`

## Archivos Clave
- `src/services/firebase.ts` - Config web SDK
- `api/lib/firebase-admin.ts` - Admin SDK init
- `api/me.ts` - Endpoint verificación usuario
- `src/app/pages/Login.tsx` - UI login
- `src/app/components/Protegido.tsx` - Route guard (UX only)
- `firestore.rules` - Reglas con `request.auth.token.admin == true`

## Tests
- `tests/rules/auth.test.ts` - Rules tests
- Unit tests: `auth.test.ts`

## Comandos
```bash
npm run test:rules        # Verifica reglas auth
npm run dev:api           # Test local con emulador
```