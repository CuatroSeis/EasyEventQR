import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { esperarSesion } from '../../src/services/sesion.ts'

/**
 * `esperarSesion()` con observador falso (sin Firebase).
 *
 * Contrato: resuelve con el primer usuario (o `null`), una sola vez, y
 * con `null` si el observador nunca habla antes del timeout.
 */
describe('esperarSesion', () => {
  it('resuelve con el usuario en cuanto el observador habla', async () => {
    const falso = { uid: 'u1' } as any
    const r = await esperarSesion(
      1000,
      (cb) => {
        cb(falso)
        return () => {}
      },
    )
    assert.equal(r, falso)
  })

  it('resuelve null si el observador nunca habla (timeout corto)', async () => {
    const r = await esperarSesion(15, () => () => {})
    assert.equal(r, null)
  })

  it('una sola resolución aunque hablen tarde y dos veces', async () => {
    let llamadas = 0
    const r = await esperarSesion(
      20,
      (cb) => {
        llamadas += 1
        const t1 = setTimeout(() => cb({ uid: 'a' } as any), 5)
        const t2 = setTimeout(() => cb({ uid: 'b' } as any), 60)
        return () => {
          clearTimeout(t1)
          clearTimeout(t2)
        }
      },
    )
    assert.deepEqual((r as any)?.uid, 'a')
    assert.equal(llamadas, 1)
  })
})
