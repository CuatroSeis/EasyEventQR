import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El app `[DEFAULT]` de Firebase Admin tiene que existir antes de llamar a
 * `getAuth()`.
 *
 * `getAuth()` sin argumentos usa el app `[DEFAULT]`, y en una lambda nadie lo
 * inicializa solo: la inicialización es perezosa, la hace `construirApp()`, y
 * `construirApp()` sólo corre cuando algo pide `getDb()`. Si un handler pide
 * `getAuth()` antes de su primer `getDb()`, `verifyIdToken` tira `app/no-app`.
 *
 * El síntoma era un diagnóstico falso. Los cuatro handlers affected hacen
 * `verifyIdToken` dentro de un `try { … } catch {}` que se come la excepción,
 * así que `app/no-app` salía como "no tenés sesión" (401) o como
 * `porQue: 'sin-sesion'`: el panel de admin expulsaba al super-admin y la UI
 * le decía que la sesión no estaba bien, cuando la sesión estaba perfecta y
 * lo único roto era el orden de dos llamadas dentro del mismo archivo.
 *
 * Estos tests fijan dos cosas:
 *
 *   1. Que `getAdminAuth()` inicializa el app (test real, sin credenciales:
 *      con `FIRESTORE_EMULATOR_HOST` puesto, `construirApp()` no necesita
 *      service account).
 *   2. Que ningún handler vuelva a llamar a `getAuth()` directo, que es
 *      como se vuelve a introducir el bug.
 */
function fuente(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const HANDLERS = [
  'api/me.ts',
  'api/operador.ts',
  'api/admin-organizadores.ts',
  'api/registros.ts',
]

describe('inicialización del app de Firebase Admin', () => {
  before(() => {
    // Con el emulador declarado, `construirApp()` inicializa sin pedir
    // credenciales: el test queda hermético y no toca la red.
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  })

  it('getAuth() sin argumentos tira app/no-app: el fallo que se está evitando', async () => {
    const { getApps } = await import('firebase-admin/app')
    const { getAuth } = await import('firebase-admin/auth')

    assert.equal(
      getApps().length,
      0,
      'el test necesita arrancar sin apps, si no no está probando el orden de inicialización',
    )

    // Éste es el error exacto que se comía el `catch {}` de los handlers.
    assert.throws(
      () => getAuth(),
      (e: unknown) => {
        const err = e as { code?: string; message?: string }
        assert.equal(err.code, 'app/no-app')
        assert.match(err.message ?? '', /default Firebase app does not exist/i)
        return true
      },
    )
  })

  it('getAdminAuth() inicializa el app y devuelve el Auth', async () => {
    const { getAdminAuth } = await import('../../src/server/lib/firebase-admin.ts')
    const { getApps } = await import('firebase-admin/app')

    // El app del test anterior NO se inicializó a propósito, así que
    // getAdminAuth() es lo que tiene que crearlo. Si este test pasara sin
    // hacer nada, el de arriba no estaría probando nada.
    const auth = await getAdminAuth()
    assert.ok(auth, 'getAdminAuth() devolvió vacío')
    assert.ok(getApps().length > 0, 'getAdminAuth() no inicializó ningún app')
    assert.equal(auth.app.name, '[DEFAULT]', 'noDevolvió el app por defecto')
  })

  it('getAdminAuth() es idempotente: llamarlo dos veces no rompe', async () => {
    const { getAdminAuth } = await import('../../src/server/lib/firebase-admin.ts')
    const [a, b] = await Promise.all([getAdminAuth(), getAdminAuth()])
    assert.equal(a, b, 'dos llamadas deberían devolver la misma instancia cacheada')
  })

  it('ningún handler llama a getAuth() directo', () => {
    for (const rel of HANDLERS) {
      const codigo = fuente(rel)
      assert.ok(
        !/\bgetAuth\s*\(\s*\)/.test(codigo),
        `${rel} llama a getAuth() sin argumentos. Usá getAdminAuth() de src/server/lib/firebase-admin.ts, que inicializa el app antes.`,
      )
    }
  })

  it('todo handler que verifica el token usa getAdminAuth()', () => {
    for (const rel of HANDLERS) {
      const codigo = fuente(rel)
      if (!codigo.includes('verifyIdToken')) continue
      assert.ok(
        codigo.includes('getAdminAuth()'),
        `${rel} verifica el token pero no usa getAdminAuth()`,
      )
    }
  })
})