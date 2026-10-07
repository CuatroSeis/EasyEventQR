import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import type { Firestore } from 'firebase-admin/firestore'
import type { Evento, Registro } from '../../src/shared/types.ts'

/**
 * `rotarToken()` contra un Firestore de mentira.
 *
 * Sin `GMAIL_USER` el mail cae al transporte de consola (devuelve
 * `enviado: true` sin red), así que se puede probar el ciclo entero:
 * mail → documento nuevo → lápida en el viejo.
 */

type Doc = { exists: boolean; id: string; data: () => any }

function memoria(inicial: Record<string, any> = {}) {
  const docs = new Map<string, any>(Object.entries(inicial))
  const ref = (coleccion: string, id: string) => ({
    id,
    _clave: `${coleccion}/${id}`,
    get: async (): Promise<Doc> => ({
      exists: docs.has(`${coleccion}/${id}`),
      id,
      data: () => docs.get(`${coleccion}/${id}`),
    }),
  })
  return {
    collection: (coleccion: string) => ({ doc: (id: string) => ref(coleccion, id) }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        get: (r: any) => r.get(),
        create: (r: any, data: any) => {
          if (docs.has(r._clave)) throw new Error('ALREADY_EXISTS')
          docs.set(r._clave, data)
        },
        set: (r: any, data: any) => {
          docs.set(r._clave, data)
        },
      }
      return fn(tx)
    },
    _docs: docs,
  }
}

function evento(): Evento {
  return {
    organizadorId: 'org',
    nombre: 'Fiesta',
    fecha: new Date('2026-12-01T20:00:00Z'),
    lugar: 'Acá',
    descripcion: '',
    capacidadMaxima: 10,
    reservas: 1,
    estado: 'activo',
    requierePago: false,
    precioEntrada: null,
    personalizacion: {
      bannerUrl: null,
      logoUrl: null,
      colorPrimario: null,
      colorSecundario: null,
      textoBienvenida: null,
      textoConfirmacion: null,
    },
    codigoCorto: 'FEST-1',
    nombreNormalizado: 'fiesta',
    slug: 'fiesta',
    visibilidad: 'publico',
  } as Evento
}

function registro(): Registro {
  return {
    eventoId: 'e1',
    nombre: 'Ana',
    email: 'ana@ejemplo.com',
    telefono: '',
    dni: '30111222',
    fechaNacimiento: '1990-01-01',
    qrHash: 'hash-viejo',
    estado: 'aprobado',
    pago: { requerido: false, estado: 'no_aplica', montoPagado: null, medioPago: null, idTransaccion: null, fechaPago: null },
    usado: false,
    fechaRegistro: new Date(),
    fechaUso: null,
  } as Registro
}

describe('rotarToken', () => {
  const ORIGINAL_USER = process.env.GMAIL_USER
  const ORIGINAL_PASS = process.env.GMAIL_APP_PASSWORD

  beforeEach(() => {
    delete process.env.GMAIL_USER
    delete process.env.GMAIL_APP_PASSWORD
  })

  afterEach(() => {
    if (ORIGINAL_USER === undefined) delete process.env.GMAIL_USER
    else process.env.GMAIL_USER = ORIGINAL_USER
    if (ORIGINAL_PASS === undefined) delete process.env.GMAIL_APP_PASSWORD
    else process.env.GMAIL_APP_PASSWORD = ORIGINAL_PASS
  })

  async function rotar(db: any, registroId = 'hash-viejo') {
    const { rotarToken } = await import('../../src/server/lib/rotacion.ts')
    return rotarToken(db as unknown as Firestore, {
      registroId,
      eventoId: 'e1',
      evento: evento(),
      base: 'https://ejemplo.com',
    })
  }

  it('crea documento nuevo y deja lápida en el viejo', async () => {
    const db = memoria({ 'registros/hash-viejo': registro() })
    const r = await rotar(db)
    assert.equal(r.ok, true)
    const nuevoId = (r as { nuevoId: string }).nuevoId
    assert.notEqual(nuevoId, 'hash-viejo')

    const nuevo = db._docs.get(`registros/${nuevoId}`)
    assert.equal(nuevo.nombre, 'Ana')
    assert.equal(nuevo.email, 'ana@ejemplo.com')
    assert.equal(nuevo.qrHash, nuevoId)
    assert.ok(nuevo.tokenEmitidoEn)
    assert.equal(nuevo.reemplazadoPor, undefined)

    const viejo = db._docs.get('registros/hash-viejo')
    assert.equal(viejo.reemplazadoPor, nuevoId)
  })

  it('registro inexistente → no hace nada', async () => {
    const db = memoria({})
    const r = await rotar(db)
    assert.equal(r.ok, false)
    assert.equal(db._docs.size, 0)
  })

  it('registro de otro evento → no lo toca', async () => {
    const db = memoria({ 'registros/hash-viejo': { ...registro(), eventoId: 'otro' } })
    const r = await rotar(db)
    assert.equal(r.ok, false)
    assert.equal(db._docs.size, 1)
    assert.equal(db._docs.get('registros/hash-viejo').eventoId, 'otro')
  })

  it('ya rotado → no rota dos veces', async () => {
    const db = memoria({
      'registros/hash-viejo': { ...registro(), reemplazadoPor: 'hash-nuevo' },
    })
    const r = await rotar(db)
    assert.equal(r.ok, false)
    assert.equal(db._docs.size, 1)
  })
})
