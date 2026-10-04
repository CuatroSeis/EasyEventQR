import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * duplicarEvento copia el contenido y pide identidad nueva al backend.
 *
 * No se puede importar el service en Node (arrastra el SDK de Firebase
 * con imports sin extensión), así que se fija el contrato sobre el
 * fuente, igual que cuenta-eliminar.test.ts.
 */

const fuente = readFileSync(new URL('../../src/services/eventos.ts', import.meta.url), 'utf8')

describe('duplicarEvento', () => {
  it('existe y delega en crearEventoBackend', () => {
    assert.ok(
      fuente.includes('export async function duplicarEvento'),
      'falta duplicarEvento en services/eventos.ts',
    )
    assert.ok(
      fuente.includes('return crearEventoBackend({'),
      'duplicar tiene que ir por el backend para que el código nazca en transacción',
    )
  })

  it('el nombre lleva el sufijo de copia', () => {
    assert.ok(
      fuente.includes('`${evento.nombre} (copia)`'),
      'la copia tiene que distinguirse en el listado',
    )
  })

  it('no arrastra identidad ni reservas', () => {
    const cuerpo = fuente.slice(
      fuente.indexOf('export async function duplicarEvento'),
      fuente.indexOf('export async function duplicarEvento') + 1200,
    )
    for (const campo of ['reservas', 'codigoCorto', 'organizadorId', 'slug', 'nombreNormalizado']) {
      assert.ok(
        !cuerpo.includes(`${campo}:`),
        `duplicar no puede mandar ${campo}: la identidad nueva la genera el backend`,
      )
    }
  })

  it('copia visibilidad, pago, cupo y banner', () => {
    const cuerpo = fuente.slice(
      fuente.indexOf('export async function duplicarEvento'),
      fuente.indexOf('export async function duplicarEvento') + 1200,
    )
    for (const campo of ['visibilidad', 'capacidadMaxima', 'requierePago', 'precioEntrada', 'bannerUrl']) {
      assert.ok(cuerpo.includes(`${campo}:`), `duplicar debería copiar ${campo}`)
    }
  })
})
