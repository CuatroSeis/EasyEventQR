import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Vercel empaqueta las functions de `api/` como **CommonJS**, aunque el
 * proyecto sea ESM. Cualquier dependencia ESM-only en el camino de
 * `verifyIdToken` rompe la verificación de tokens en producción, y no en
 * local: el error era `ERR_REQUIRE_ESM` en el require de `jose`.
 *
 * La cadena es: `firebase-admin` → `jwks-rsa` (CommonJS) → `jose`.
 * `jwks-rsa@4` declara `jose@^6`, que es ESM puro, así que el `require()`
 * de `jwks-rsa` a `jose` no puede funcionar. El `overrides` de package.json
 * lo baja a `jose@^5`, que todavía publica un build CommonJS.
 *
 * El síntoma era invisible desde el repo: local andaba, los tests de
 * handlers pasaban, y en producción `verifyIdToken` moría siempre. Peor: un
 * `catch {}` lo traducía a "no tenés sesión", o sea que el bug se leía como
 * un problema de login.
 *
 * Estos tests miran el árbol de `node_modules` ya instalado, que es donde se
 * decide el modo de módulo. Sirven para que un `npm install` que deshaga el
 * override se note acá y no en producción.
 */
const require_ = createRequire(join(process.cwd(), 'package.json'))

/**
 * Lee el package.json de un paquete instalado.
 *
 * No se usa `require.resolve('<pkg>/package.json')` porque no todos los
 * paquetes exponen `./package.json` en su `exports`: `firebase-admin` no lo
 * hace y el require tira ERR_PACKAGE_PATH_NOT_EXPORTED. Se sube por
 * `node_modules` a mano, que es como npm los dejó en disco.
 */
function paquetDe(pkg: string, desde = process.cwd()): Record<string, unknown> {
  let dir = desde
  for (let i = 0; i < 10; i += 1) {
    const ruta = join(dir, 'node_modules', pkg, 'package.json')
    if (existsSync(ruta)) {
      return JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, unknown>
    }
    const padre = dirname(dir)
    if (padre === dir) break
    dir = padre
  }
  throw new Error(`no se encontró ${pkg}/package.json subiendo desde ${desde}`)
}

describe('jose tiene que ser require-able', () => {
  it('la versión que resuelve jwks-rsa publica un entry CommonJS', () => {
    const desdeJwkrs = join(process.cwd(), 'node_modules', 'jwks-rsa')
    const pkg = paquetDe('jose', desdeJwkrs)

    // `jose@6` es `"type": "module"` sin condición `require` en sus exports:
    // sólo existe el build ESM. `jwks-rsa` lo carga con require() desde CJS.
    const exportsDeJose = pkg.exports as Record<string, Record<string, string>> | undefined
    const condicionRequire = exportsDeJose?.['.']?.require

    assert.ok(
      condicionRequire !== undefined,
      `jose@${String(pkg.version)} no publica condición "require" en sus exports: es ESM-only y ` +
        'jwks-rsa no lo puede cargar con require(). Revisá el "overrides" de package.json.',
    )
    assert.notEqual(pkg.type, 'module', `jose@${String(pkg.version)} se declara como ESM-only`)
  })

  it('el build que se carga es el CommonJS, no un .mjs', () => {
    const entrada = require_.resolve('jose', {
      paths: [join(process.cwd(), 'node_modules', 'jwks-rsa')],
    })
    assert.ok(
      !entrada.endsWith('.mjs'),
      `jose resuelve a un módulo ESM (${entrada}): require() de un ESM tira ERR_REQUIRE_ESM`,
    )
    assert.match(entrada, /cjs/i, `jose resolved a ${entrada}, que no es el build CommonJS`)
  })

  it('el overrides de package.json sigue fijando jose por debajo de v6', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const fijado = pkg.overrides?.jose as string | undefined

    assert.ok(
      fijado !== undefined,
      'package.json no tiene overrides.jose: sin esto, jwks-rsa@4 arrastra jose@6 y la ' +
        'verificación de tokens vuelve a fallar en producción',
    )
    assert.ok(
      !/^\s*[~^]?\s*6/.test(fijado),
      `overrides.jose es "${fijado}" y vuelve a traer jose@6 (ESM-only)`,
    )
  })
})

describe('la cadena que verifica tokens es CommonJS', () => {
  it('jwks-rsa es CommonJS, que es lo que obliga a que jose lo sea', () => {
    const jwks = paquetDe('jwks-rsa')
    assert.notEqual(
      jwks.type,
      'module',
      `jwks-rsa@${String(jwks.version)} pasó a ser ESM: si algún día lo es, este test sobra`,
    )
  })

  it('firebase-admin sigue trayendo jwks-rsa (no cambió el contrato)', () => {
    const admin = paquetDe('firebase-admin')
    const deps = admin.dependencies as Record<string, string>
    const rango = deps['jwks-rsa'] ?? ''
    const mayor = Number(/(\d+)/.exec(rango)?.[1])

    assert.equal(
      mayor,
      4,
      `firebase-admin@${String(admin.version)} pide jwks-rsa@${rango} (mayor ${mayor}): ` +
        'si cambió de versión hay que revisar el mode de módulo de la cadena que verifica tokens',
    )
  })
})