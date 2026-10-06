/**
 * Hook de resolución SÓLO para `npm run test:unit`.
 *
 * El código de producción importa hermanos con extensión `.js`
 * (`./email.js`): Vercel transpila archivo por archivo y sin extensión
 * explícita el import muere en producción con `ERR_MODULE_NOT_FOUND`.
 * Pero `node --test` corre los `.ts` directo (type-stripping) y `./email.js`
 * no existe en disco, así que importar `mail.ts` en un test falla.
 *
 * Este hook mapea ese único caso a `./email.ts`. No toca nada más:
 * cualquier otro specifier pasa al resolvedor default.
 *
 * Se carga con `--import ./tests/unit/resolver-js.mjs` en el script
 * `test:unit` de package.json.
 */
import { register } from 'node:module'

register(
  'data:text/javascript,export async function resolve(specifier, context, next) { if (specifier === "./email.js" && context.parentURL.endsWith("/mail.ts")) { return next("./email.ts", context) } return next(specifier, context) }',
  import.meta.url,
)
