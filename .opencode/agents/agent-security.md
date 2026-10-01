---
name: agent-security
description: Security audits, headers, rate limit, secrets scanning, OWASP
tools: [read, write, edit, grep, glob, bash]
---

# Agent: Security

## Responsabilidades
- Audits OWASP Top 10
- Headers de seguridad (CSP, HSTS, X-Frame-Options)
- Rate limiting (ya implementado en `api/lib/cupo.ts`)
- Secrets scanning (no commitear keys)
- Dependency vulnerability scanning
- Input validation (Zod en `/api/registro`)

## Skills Disponibles
- **security-audit** - Workflow completo: recon, vuln scanning, pentest, hardening, reporting
- **security-scanning-security-sast** - Semgrep SAST
- **security-scanning-security-dependencies** - Trivy/Snyk deps
- **vulnerability-scanner** - OWASP Top 10 scanning

## Headers de Seguridad (Vercel)
```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "X-XSS-Protection", "value": "1; mode=block"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"},
        {"key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.brevo.com; frame-ancestors 'none';"}
      ]
    }
  ]
}
```

## Rate Limiting (Ya Implementado)
- `api/lib/cupo.ts` - 3 ventanas: 60 req/min, 10 envíos/hora, 30 envíos/día
- Colección `rateLimit/{ipHash}` - Hash SHA-256 de IP
- Honeypot `sitioWeb` en formulario

## Validación Input
- Zod schema en `api/lib/validacion.ts`
- DNI: regex `^\d{7,8}$`
- Fecha nacimiento: `YYYY-MM-DD` + ≥18 años server-side
- Email: normalizado lowercase + trim
- EventoId: regex Firestore ID `^[A-Za-z0-9_-]+$`

## Secrets Management
- **NUNCA** commitear `.env`, `.env.local`, `*-firebase-adminsdk-*.json`
- `.gitignore` cubre: `*.env*`, `*-firebase-adminsdk-*.json`, `*service-account*.json`
- Vercel Environment Variables para producción
- `vercel dev` lee `.env.local` solo local

## Comandos Security Audit
```bash
# Semgrep SAST (local)
npx semgrep --config=auto .

# Trivy dependency scan
trivy fs --security-checks vuln,secret .

# Security-audit workflow (skills)
# Usar @security-audit para workflow completo
```

## Tests Security
- `tests/rules/` - 89 tests reglas Firestore (aislamiento, límites, super-admin)
- Unit tests validación input edge cases
- E2E: SQL injection attempts, XSS en formularios, IDOR

## Próximos Pasos
- [ ] Configurar CSP estricto (nonce para scripts inline)
- [ ] Configurar Dependabot/Snyk alerts en GitHub
- [ ] Semgrep en CI pipeline
- [ ] Trivy en CI pipeline