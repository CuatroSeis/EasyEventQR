/**
 * Hook de resolución SÓLO para `npm run test:unit`.
 *
 * El código de producción importa hermanos con extensión `.js`
 * (`./email.js`): Vercel transpila archivo por archivo y sin extensión
 * explícita el import muere en producción con `ERR_MODULE_NOT_FOUND`.
 * Pero `node --test` corre los `.ts` directo (type-stripping) y `./x.js`
 * no existe en disco, así que importar esos módulos en un test falla.
 *
 * Este hook mapea `./x.js` → `./x.ts` cuando el que importa es un `.ts`
 * del proyecto. No toca nada más: cualquier otro specifier, o un padre
 * `.js` (el caso de Vercel compilado), pasa al resolvedor default.
 *
 * Se carga con `--import ./tests/unit/resolver-js.mjs` en el script
 * `test:unit` de package.json.
 */
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    'export async function resolve(specifier, context, next) {' +
    '  if (typeof specifier === "string" && specifier.endsWith(".js") &&' +
    '      (specifier.startsWith("./") || specifier.startsWith("../")) &&' +
    '      typeof context.parentURL === "string" && context.parentURL.endsWith(".ts")) {' +
    '    try { return await next(specifier.slice(0, -3) + ".ts", context) } catch {}' +
    '  }' +
    '  return next(specifier, context)' +
    '}',
  import.meta.url,
)
