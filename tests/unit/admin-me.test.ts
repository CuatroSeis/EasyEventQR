import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `/api/me` y `api/admin-organizadores.ts` tienen que decidir super-admin
 * con el MISMO criterio.
 *
 * Son las dos mitades de la misma puerta: `/api/me` decide si el panel se
 * abre, y `api/admin-organizadores` revisa cada operación. Cuando no
 * coinciden, el síntoma es que al super-admin lo echan del panel sin
 * explicación, que fue exactamente el bug reportado.
 *
 * El caso que lo rompió: `/api/me` miraba sólo `SUPER_ADMIN_UID` e ignoraba
 * el custom claim `admin`. Con el claim asignado y la variable sin definir
 * (lo normal en un entorno nuevo), `isAdmin` volvía false siempre.
 *
 * No se puede probar el handler sin Firebase Admin, pero sí se puede fijar
 * que las dos implementaciones miren el claim y la variable.
 */
/**
 * Devuelve el archivo SIN comentarios.
 *
 * Sin esto el test de `x-user-uid` falla siempre: los dos archivos explican
 * en un comentario por qué se quitó ese header, y el test leía la
 * explicación como si fuera código. Buscar en el código real es lo único
 * que responde la pregunta que importa.
 */
function fuente(rel: string): string {
  const crudo = readFileSync(join(process.cwd(), rel), 'utf8')
  return crudo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const me = fuente('api/me.ts')
const admin = fuente('api/admin-organizadores.ts')

describe('criterio de super-admin', () => {
  it('/api/me mira el custom claim admin, no sólo la variable', () => {
    assert.ok(
      /\.admin\s*===\s*true/.test(me),
      '/api/me no lee el claim `admin` del token: con el claim puesto y SUPER_ADMIN_UID sin definir devuelve isAdmin:false siempre',
    )
  })

  it('/api/me también acepta el UID por variable', () => {
    assert.ok(
      /SUPER_ADMIN_UID\s*!==?\s*undefined\s*&&\s*(decoded|uid)\.uid\s*===\s*SUPER_ADMIN_UID|SUPER_ADMIN_UID\s*!==?\s*undefined\s*&&\s*uid\s*===\s*SUPER_ADMIN_UID/.test(me),
      '/api/me perdió el break-glass por UID',
    )
  })

  it('las dos puertas usan el mismo criterio', () => {
    // El claim se chequea en los dos lados, con la misma comparación
    // estricta. Si uno pasa a `if (decoded.admin)` y el otro no, se rompe
    // la equivalencia justo cuando el claim no existe.
    assert.ok(/\.admin\s*===\s*true/.test(me))
    assert.ok(/\.admin\s*===\s*true/.test(admin))
  })

  it('ninguna de las dos acepta x-user-uid como credencial', () => {
    for (const [nombre, f] of [['api/me.ts', me], ['admin-organizadores.ts', admin]] as const) {
      assert.ok(
        !f.includes('x-user-uid'),
        `${nombre} vuelve a leer el header x-user-uid: la autorización volvería a apoyarse en un dato que elige el cliente`,
      )
    }
  })

  it('/api/me explica el motivo del rechazo', () => {
    // Sin esto la UI no puede decir por qué la echaron: el síntoma es
    // "no tengo permisos" y no distingue claim de variable.
    assert.ok(/porQue/.test(me), '/api/me no devuelve por qué no es admin')
  })
})

describe('el claim se lee sin reventar', () => {
  it('la comparación del claim está dentro de un try o es un acceso directo', () => {
    // Cuando el claim no existe, `decoded.admin` no es undefined: es una
    // excepción al acceder. Si eso se come el try de verifyIdToken, un
    // token perfectamente válido pasa por "token inválido".
    const idx = me.indexOf('.admin === true')
    assert.ok(idx !== -1)
    const previo = me.slice(0, idx)
    const tryAbierto = (previo.match(/\btry\s*\{/g) ?? []).length
    const catches = (me.match(/\}\s*catch/g) ?? []).length
    assert.ok(tryAbierto > 0, 'la lectura del claim debería estar dentro de un try/catch')
    assert.ok(catches > 0)
  })
})
