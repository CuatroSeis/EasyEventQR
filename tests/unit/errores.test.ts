import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { explicarErrorFirestore, ErrorDePermiso } from '../../src/services/errores.ts'
import type { Organizador } from '../../src/shared/types.ts'

/**
 * Por qué el mensaje de permiso importa tanto.
 *
 * El bug que "/" le reportó al usuario fue exactamente esto: una cuenta
 * que no podía crear eventos, con un mensaje que no decía por qué. Peor:
 * el mensaje que había era "tu plan no permite ese cambio", que es
 * FALSO si en realidad la cuenta estaba suspendida, y manda al usuario a
 * cambiar el plan en vez de a reactivar la cuenta.
 *
 * Estos tests fijan que la atribución sea correcta, que es lo único que
 * hace que el mensaje sirva.
 */

function organizador(extra: Partial<Organizador> = {}): Organizador {
  return {
    uid: 'uid-1',
    email: 'a@b.com',
    nombre: 'Ana',
    fechaAlta: new Date(),
    plan: 'gratis',
    estadoSuscripcion: 'activo',
    brandingPanel: { logoUrl: null, colorPrimario: null, colorSecundario: null },
    limitesPersonalizacion: {
      bannerPermitido: false,
      colorPersonalizadoPermitido: true,
      logoPermitido: false,
      capacidadMaximaPorEvento: 100,
    },
    ...extra,
  }
}

const DENEGADO = { code: 'permission-denied' }

describe('explicarErrorFirestore', () => {
  it('con la cuenta suspendida, dice suspendido y NO culpa al plan', () => {
    const err = explicarErrorFirestore(DENEGADO, organizador({ estadoSuscripcion: 'suspendido' }))

    assert.ok(err instanceof ErrorDePermiso)
    assert.equal(err.causa, 'suspendido')

    // La regresión que hay que evitar: el mensaje anterior clavaba el
    // plan y con razón equivocada.
    assert.ok(
      !/plan/i.test(err.message),
      `el mensaje culpa al plan cuando la causa es la suspensión: ${err.message}`,
    )
    assert.ok(/reactiv/i.test(err.message), `debería decir cómo se resuelve: ${err.message}`)
  })

  it('con el documento sin leer, no inventa una causa', () => {
    const err = explicarErrorFirestore(DENEGADO, null)

    assert.ok(err instanceof ErrorDePermiso)
    assert.equal(err.causa, 'sin-documento')
    assert.ok(!/plan/i.test(err.message), `no puede culpar al plan sin saber: ${err.message}`)
  })

  it('si el pedido excede el límite conocido, da los números', () => {
    const err = explicarErrorFirestore(DENEGADO, organizador(), { limite: 100, pedido: 5000 })

    assert.ok(err instanceof ErrorDePermiso)
    assert.equal(err.causa, 'plan')
    assert.match(err.message, /100/)
    assert.match(err.message, /5000/)
  })

  it('sin contexto de límite y con la cuenta activa, queda como desconocido', () => {
    const err = explicarErrorFirestore(DENEGADO, organizador())
    assert.ok(err instanceof ErrorDePermiso)
    assert.equal(err.causa, 'desconocido')
  })

  it('el límite NO pisa a la suspensión', () => {
    // La suspensión es la causa más específica: si la cuenta está
    // suspendida, hablar de capacidad distrae del remedio real.
    const err = explicarErrorFirestore(DENEGADO, organizador({ estadoSuscripcion: 'suspendido' }), {
      limite: 100,
      pedido: 5000,
    })
    assert.equal((err as ErrorDePermiso).causa, 'suspendido')
  })

  it('un problema de red no se reporta como permiso', () => {
    const err = explicarErrorFirestore({ code: 'unavailable' }, organizador())
    assert.ok(!(err instanceof ErrorDePermiso), 'no es un tema de permisos')
    assert.ok(/conexi/i.test(err.message), `debería hablar de la conexión: ${err.message}`)
  })

  it('un error desconocido no promete una causa', () => {
    const err = explicarErrorFirestore({ code: 'quota-exceeded' }, organizador())
    assert.ok(!(err instanceof ErrorDePermiso))
    assert.ok(!/plan/i.test(err.message))
  })

  it('sin código de Firebase tampoco inventa permiso', () => {
    const err = explicarErrorFirestore(new Error('boom'), organizador())
    assert.ok(!(err instanceof ErrorDePermiso))
  })

  it('el mensaje sigue siendo un Error normal', () => {
    // La UI hace `fallo instanceof Error ? fallo.message : ...`, así que
    // si esto no fuera un Error, el formulario mostraría un texto genérico.
    const err = explicarErrorFirestore(DENEGADO, organizador())
    assert.ok(err instanceof Error)
    assert.ok(err.message.length > 0)
  })
})
