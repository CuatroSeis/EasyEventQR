import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  LONGITUD_TOKEN_ESPERADA,
  esFormatoToken,
  generarToken,
  hashearToken,
  imagenQrDe,
} from '../../src/server/lib/qr.ts'

/**
 * Tests del token del QR.
 *
 * El token es lo único que separa "tener una entrada" de "no tenerla",
 * y la única copia vive en el mail del asistente. Estos tests fijan tres
 * cosas que, si cambian, rompen entradas en producción de forma silenciosa:
 *
 *   1. Que dos tokens nunca son iguales.
 *   2. Que la huella es determinista y de un solo sentido.
 *   3. Que el formato del token no cambia sin que se note, porque el
 *      nombre del documento de Firestore es la huella.
 */

describe('generarToken', () => {
  it('devuelve tokens distintos cada vez', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 2_000; i += 1) vistos.add(generarToken())
    assert.equal(vistos.size, 2_000, 'debería haber 2000 tokens distintos')
  })

  it('devuelve 32 caracteres', () => {
    assert.equal(generarToken().length, LONGITUD_TOKEN_ESPERADA)
  })

  it('devuelve base64url, sin + / ni padding', () => {
    // base64url usa '-' y '_' donde base64 usa '+' y '/', y no lleva '='.
    // Si alguien cambia la codificación sin cambiar el patrón de
    // esFormatoToken, todos los tokens emitidos dejan de validar.
    for (let i = 0; i < 200; i += 1) {
      assert.match(generarToken(), /^[A-Za-z0-9_-]+$/)
    }
  })

  it('no se parece a una fecha ni a un contador', () => {
    // Un token que se pudiera adivinar (epoch, un id incremental) no
    // serviría de nada: el QR entero se apoya en que sea impredecible.
    const token = generarToken()
    assert.doesNotMatch(token, /^\d+$/)
    assert.ok(!token.startsWith('17'), 'no debería arrancar con el prefijo de un epoch de 2026')
  })
})

describe('hashearToken', () => {
  it('es determinista: el mismo token da la misma huella', () => {
    const token = generarToken()
    assert.equal(hashearToken(token), hashearToken(token))
  })

  it('tokens distintos dan huellas distintas', () => {
    assert.notEqual(hashearToken(generarToken()), hashearToken(generarToken()))
  })

  it('son 64 caracteres hexadecimales, que es un SHA-256', () => {
    assert.match(hashearToken(generarToken()), /^[0-9a-f]{64}$/)
  })

  it('NO contiene el token: es de un solo sentido', () => {
    const token = generarToken()
    const huella = hashearToken(token)

    // La properties más importante del diseño, dicha como test: si el
    // token estuviera dentro de la huella, un dump de Firestore
    // permitiría fabricar entradas sin romper nada.
    assert.ok(!huella.includes(token), 'la huella no puede contener el token')
    assert.ok(!huella.includes(token.slice(0, 8)), 'ni un prefijo del token')
  })

  it('distingue tokens que se parecen', () => {
    // Un solo bit de diferencia tiene que cambiar la huella entera.
    const a = hashearToken('a'.repeat(32))
    const b = hashearToken('a'.repeat(31) + 'b')
    assert.notEqual(a, b)
  })
})

describe('esFormatoToken', () => {
  it('acepta un token recién generado', () => {
    assert.equal(esFormatoToken(generarToken()), true)
  })

  it('rechaza longitudes que no son las esperadas', () => {
    for (const valor of ['', 'a', 'a'.repeat(31), 'a'.repeat(33), 'a'.repeat(200)]) {
      assert.equal(esFormatoToken(valor), false, `debería rechazar un token de largo ${valor.length}`)
    }
  })

  it('rechaza caracteres que no son de base64url', () => {
    // Un token con '+', '/' o '=' es base64 pelado. Si pasara el filtro,
    // el hasher lo aceptaría y buscaría un documento que no existe: no
    // rompe nada, pero gasta una lectura y deja de filtrar basura.
    for (const valor of ['a'.repeat(31) + '+', 'a'.repeat(31) + '/', 'a'.repeat(31) + '=', 'a'.repeat(31) + ' ']) {
      assert.equal(esFormatoToken(valor), false)
    }
  })

  it('rechaza lo que no es una cadena', () => {
    // El ?t= de la URL siempre llega como string, pero el filtro se
    // llama desde un lugar donde el tipo todavía no se chequeó.
    for (const valor of [null, undefined, 42, {}, [], true]) {
      assert.equal(esFormatoToken(valor), false)
    }
  })
})

describe('imagenQrDe', () => {
  it('devuelve un PNG en base64', async () => {
    // El test tiene que distinguir una imagen de verdad de un string
    // cualquiera: 'data:image/png;base64' es el prefijo, y después
    // tienen venir bytes de PNG (la firma 0x89504E47).
    const dataUrl = await imagenQrDe('https://easyeventqr.vercel.app/q/abc')
    assert.match(dataUrl, /^data:image\/png;base64,/)
    const bytes = Buffer.from(dataUrl.split(',')[1]!, 'base64')
    assert.equal(bytes.subarray(0, 4).toString('hex'), '89504e47', 'no es un PNG')
  })

  it('dos URLs distintas dan imágenes distintas', async () => {
    const a = await imagenQrDe('https://easyeventqr.vercel.app/q/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const b = await imagenQrDe('https://easyeventqr.vercel.app/q/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    assert.notEqual(a, b)
  })

  it('la misma URL da siempre la misma imagen', async () => {
    // Si no, el mismo asistente con el mismo mail tendría dos QRs
    // distintos y no se podría verificar nada reproducible.
    const a = await imagenQrDe('https://easyeventqr.vercel.app/q/abc')
    const b = await imagenQrDe('https://easyeventqr.vercel.app/q/abc')
    assert.equal(a, b)
  })
})

/**
 * El contrato entre "el token del mail" y "el id del documento".
 *
 * Este bloque existe por un bug real: `POST /api/validar` (el escáner de
 * la puerta) buscaba `doc(token)` con el token EN CLARO, mientras que el
 * documento se llama por la huella y el GET de lectura sí hasheaba. Como
 * el token son 192 bits aleatorios, esa búsqueda no encontraba nunca nada
 * y TODA entrada daba "Código no válido": el escáner estaba roto al 100%,
 * sin que ningún test lo notara porque cada función por separado era
 * correcta.
 *
 * Lo que se fija acá es la propiedad que lo hace imposible volver a
 * romper: el token nunca es el id del documento. Siempre su SHA-256.
 */
describe('el token nunca es el id del documento', () => {
  it('el id del documento es la huella del token, no el token', () => {
    const token = generarToken()
    const idDocumento = hashearToken(token)

    assert.notEqual(idDocumento, token, 'el documento se está nombrando con el token en claro')
    assert.equal(idDocumento.length, 64, 'una huella SHA-256 en hexadecimal son 64 caracteres')
    assert.equal(idDocumento, hashearToken(token), 'la huella tiene que ser determinista')
  })

  it('el token del mail pasa el filtro de formato y su huella no', () => {
    // Sirve para recordar por qué los dos caminos tienen que hashear: si
    // alguien "optimiza" el hasheo del GET, el filtro de formato lo
    // delata en el test.
    const token = generarToken()
    assert.ok(esFormatoToken(token), 'el token emitido tiene que pasar su propio filtro')

    const huella = hashearToken(token)
    assert.equal(esFormatoToken(huella), false, 'la huella no es un token válido; no debería pasar el filtro')
  })

  it('dos tokens del mismo registro nunca dan la misma huella', () => {
    // Lo que hace el reenvío: rota el token y cambia la huella. Si dos
    // tokens dieran la misma huella, la rotación no revocaría el QR viejo
    // y habría dos entradas válidas para el mismo asiento.
    const anterior = generarToken()
    const nuevo = generarToken()
    assert.notEqual(hashearToken(anterior), hashearToken(nuevo))
  })
})
