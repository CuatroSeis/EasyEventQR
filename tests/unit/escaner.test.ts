import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { extraerTokenQr } from '../../src/app/components/useEscanerQr.ts'

/**
 * Parseo de lo que leyó la cámara, sin cámara.
 *
 * El QR trae la URL completa, pero si algún día llega el token pelado
 * (QR generado a mano, otro lector) también tiene que servir.
 */
describe('extraerTokenQr', () => {
  it('saca token y eventoId de la URL completa', () => {
    assert.deepEqual(extraerTokenQr('https://easyeventqr.vercel.app/q/ABC123?eventoId=e1'), {
      token: 'ABC123',
      eventoId: 'e1',
    })
  })

  it('acepta la URL sin eventoId', () => {
    assert.deepEqual(extraerTokenQr('https://x/q/ABC123'), { token: 'ABC123', eventoId: null })
  })

  it('acepta el token pelado', () => {
    assert.deepEqual(extraerTokenQr('  ABC123  '), { token: 'ABC123', eventoId: null })
  })

  it('rechaza vacío y rutas sin /q/', () => {
    assert.throws(() => extraerTokenQr('   '), /QR inválido/)
    assert.throws(() => extraerTokenQr('https://x/otra/cosa'), /QR inválido/)
  })
})
