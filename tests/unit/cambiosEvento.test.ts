import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { cambiosEventoLimpios } from '../../src/services/cambiosEvento.ts'

describe('cambiosEventoLimpios', () => {
  it('conserva una categoría soportada', () => {
    assert.equal(cambiosEventoLimpios({ categoria: 'energy-earth' }).categoria, 'energy-earth')
  })

  it('permite limpiar la categoría con null', () => {
    assert.equal(cambiosEventoLimpios({ categoria: null }).categoria, null)
  })

  it('no incluye categoría si no se edita', () => {
    assert.ok(!('categoria' in cambiosEventoLimpios({ nombre: 'Otro' })))
  })

  it('descarta una llave inventada', () => {
    assert.deepEqual(cambiosEventoLimpios({ categoria: 'xss' as never }), {})
  })

  it('mantiene el resto de la sanitización existente', () => {
    const limpio = cambiosEventoLimpios({
      nombre: '  Fiesta  ',
      requierePago: false,
      precioEntrada: 500,
      categoria: 'trigger-ocean',
    })

    assert.equal(limpio.nombre, 'Fiesta')
    assert.equal(limpio.nombreNormalizado, 'fiesta')
    assert.equal(limpio.requierePago, false)
    assert.equal(limpio.precioEntrada, null)
    assert.equal(limpio.categoria, 'trigger-ocean')
  })
})
