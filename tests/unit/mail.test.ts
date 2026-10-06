import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import type { EntradaDelMail } from '../../src/server/lib/email.ts'

/**
 * Selección de transporte de mail, sin red.
 *
 * El envío real por SMTP no se puede probar sin credenciales ni cuenta:
 * lo que sí se fija es la compuerta. Sin `GMAIL_USER` + `GMAIL_APP_PASSWORD`
 * el alta no puede romperse por falta de mail: cae a consola y la reserva
 * sigue.
 */

function entrada(): EntradaDelMail {
  return {
    destinatario: 'ana@ejemplo.com',
    nombreAsistente: 'Ana',
    urlQr: 'https://ejemplo.com/q/token',
    imagenQr: 'data:image/png;base64,AAA',
    evento: {
      eventoId: 'e1',
      nombre: 'Evento',
      fechaIso: new Date().toISOString(),
      lugar: 'Acá',
      textoConfirmacion: null,
      colorPrimario: null,
    },
  }
}

describe('smtpConfigurado', () => {
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

  it('apagado sin las dos variables', async () => {
    const { smtpConfigurado } = await import('../../src/server/lib/mail.ts')
    assert.equal(smtpConfigurado(), false)
  })

  it('apagado si falta cualquiera de las dos', async () => {
    process.env.GMAIL_USER = 'yo@gmail.com'
    const { smtpConfigurado } = await import('../../src/server/lib/mail.ts')
    assert.equal(smtpConfigurado(), false)
  })

  it('prendido sólo con usuario + app password', async () => {
    process.env.GMAIL_USER = 'yo@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'xxxx xxxx xxxx xxxx'
    const { smtpConfigurado } = await import('../../src/server/lib/mail.ts')
    assert.equal(smtpConfigurado(), true)
  })

  it('sin credenciales el envío cae a consola y no tira', async () => {
    const { enviarMail } = await import('../../src/server/lib/mail.ts')
    const r = await enviarMail(entrada())
    assert.deepEqual(r, { enviado: true, transporte: 'consola' })
  })
})
