# ESTADO — EasyEventQR

Estado actual, pendientes y cómo verificar. Se actualiza en cada sesión
que cambie cualquiera de las tres cosas.

## Estado actual

✅ Deploy funcionando (`https://easyeventqr.vercel.app`), `/admin` abre.
Fases 0–9 + upgrades (MP real, Sentry, presets, SMTP, rotación) hechos.
Gates en verde: typecheck · lint · unit (208) · rules (90) · e2e (7) · build.

## Pendiente (requiere al operador, no sale del repo)

1. 🔴 **Rotar `OPERADOR_SECRET`** — el valor viejo estuvo en el repo.
   `openssl rand -base64 48` → Vercel → reemplazar.
2. 🔴 **Rotar el service account** — la clave privada se imprimió en un
   chat. Crear key nueva, actualizar `FIREBASE_SERVICE_ACCOUNT`, borrar la
   vieja (`4a908f6d...`) y el JSON local.
3. **Recorrer los 12 pasos** de `docs/arquitectura/ENDPOINTS.md` con
   navegador (nunca se corrió completo).
4. **Mail real**: `GMAIL_USER` + `GMAIL_APP_PASSWORD` en Vercel + redeploy.
5. **`MERCADOPAGO_SIMULADO=true`** sólo para pruebas; apagarlo antes de
   compartir (con simulación prendida cualquiera se marca pagado).
6. **Variables de Vercel**: casi todas en Production solamente; para
   previews marcar Preview/Development. Sacar `VITE_USAR_EMULADORES` de
   Production si está en `si`.
7. ~~**Doble deploy**~~ Hecho: dueña única Vercel Git; Actions solo verifica.
   Borrar `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` de GitHub Secrets.

## Deuda no bloqueante

- `TOPE_LECTURA = 2000` en el listado global del admin (filtros mienten
  con más de 2000 registros).
- Lint: sólo warnings `set-state-in-effect` / `only-export-components`.
- `VERCEL_TOKEN` ya no se usa (Actions no despliega): borrarlo de GitHub Secrets.

## Verificar

```bash
npm run typecheck
npm run lint          # warnings conocidos, exit 0
npm run test:unit     # 208 tests
npm run test:rules    # 90 tests (JRE de .tools/)
npm run test:e2e      # 7 pasos contra emulador
npm run build         # app + widget
```

Si `test:rules` dice `port taken`: `pkill -f cloud-firestore-emulat[o]r`
(el patrón con `[o]` no se mata a sí mismo). **Node 22.6+ obligatorio.**
