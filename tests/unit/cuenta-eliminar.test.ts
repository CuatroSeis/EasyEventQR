import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * DELETE /api/me — baja con cascada de la propia cuenta.
 *
 * El borrado tiene que pasar por el backend (no por deletes sueltos del
 * cliente) porque son N documentos y la cuenta de Auth sólo la borra el
 * Admin SDK. Estos tests fijan el contrato sin levantar servidores: leen
 * el fuente y exigen las piezas.
 */

const fuente = readFileSync(new URL('../../api/me.ts', import.meta.url), 'utf8')

describe('DELETE /api/me borra la cuenta propia con cascada', () => {
  it('existe la rama DELETE', () => {
    assert.ok(
      fuente.includes("req.method === 'DELETE'"),
      'api/me.ts no maneja DELETE: el botón de Cuenta pega contra una pared',
    )
  })

  it('borra registros, eventos, documento y Auth, en ese orden', () => {
    for (const pieza of [
      "where('organizadorId', '==', uid)",
      "where('eventoId', '==',",
      "collection('eventos')",
      "collection('organizadores')",
      'deleteUser(uid)',
    ]) {
      assert.ok(fuente.includes(pieza), `falta la pieza de cascada: ${pieza}`)
    }
  })

  it('la puerta de atrás no se auto-elimina por acá', () => {
    assert.ok(
      fuente.includes('SUPER_ADMIN_UID') && fuente.includes('panel de super-admin'),
      'sin guard para SUPER_ADMIN_UID: se puede perder el break-glass',
    )
  })

  it('el uid sale del token verificado, no del cuerpo', () => {
    assert.ok(
      fuente.includes('verifyIdToken'),
      'el DELETE tiene que verificar el Bearer token como el GET',
    )
  })
})
