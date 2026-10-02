import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

/**
 * El flag de simulación y la verificación de firma.
 *
 * La pantalla de checkout simulada aprueba pagos desde el navegador. Todo
 * lo que este archivo testea existe para que eso NO sea un problema:
 * apagado por defecto (estas pruebas), y con firma real si alguien algún
 * día enchufa Mercado Pago de verdad (estas otras).
 */
describe('simulacionActiva', () => {
  const original = process.env.MERCADOPAGO_SIMULADO

  beforeEach(() => {
    delete process.env.MERCADOPAGO_SIMULADO
  })

  afterEach(() => {
    if (original === undefined) delete process.env.MERCADOPAGO_SIMULADO
    else process.env.MERCADOPAGO_SIMULADO = original
  })

  it('apagada si la variable no está', async () => {
    const { simulacionActiva } = await import('../../src/server/lib/mercadopago.ts')
    assert.equal(simulacionActiva(), false)
  })

  it('prendida sólo con el string exacto "true"', async () => {
    const { simulacionActiva } = await import('../../src/server/lib/mercadopago.ts')

    process.env.MERCADOPAGO_SIMULADO = 'true'
    assert.equal(simulacionActiva(), true)

    process.env.MERCADOPAGO_SIMULADO = '1'
    assert.equal(simulacionActiva(), false, '"1" no es "true": que sea explícito')

    process.env.MERCADOPAGO_SIMULADO = 'si'
    assert.equal(simulacionActiva(), false)
  })

  it('"false" NO la prende (el Boolean() que casi se escribe)', async () => {
    // La trampa: `Boolean(process.env.X)` con X="false" da `true`, así que
    // un `MERCADOPAGO_SIMULADO=false` en el panel de Vercel terminaría
    // PRENDIENDO la simulación en producción. Es el test que sostiene la
    // comparación por string.
    const { simulacionActiva } = await import('../../src/server/lib/mercadopago.ts')
    process.env.MERCADOPAGO_SIMULADO = 'false'
    assert.equal(simulacionActiva(), false)
  })
})

describe('verificarFirmaMP', () => {
  const SECRETO = 'whsec_un_secreto_de_prueba_para_firmar'

  beforeEach(() => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO
  })

  afterEach(() => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
  })

  function firmar(ts: number, dataId: string, requestId: string, secreto = SECRETO): string {
    const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`
    const v1 = createHmac('sha256', secreto).update(manifiesto).digest('hex')
    return `ts=${ts},v1=${v1}`
  }

  it('acepta una firma correcta', async () => {
    const { verificarFirmaMP } = await import('../../src/server/lib/mercadopago.ts')
    const ts = Math.floor(Date.now() / 1000)
    assert.equal(verificarFirmaMP(firmar(ts, 'pay_1', 'req_1'), 'req_1', 'pay_1'), true)
  })

  it('rechaza una firma hecha con otro secreto', async () => {
    const { verificarFirmaMP } = await import('../../src/server/lib/mercadopago.ts')
    const ts = Math.floor(Date.now() / 1000)
    assert.equal(verificarFirmaMP(firmar(ts, 'pay_1', 'req_1', 'otro_secreto'), 'req_1', 'pay_1'), false)
  })

  it('rechaza si el dataId del manifiesto no es el del cuerpo', async () => {
    // Es el ataque real: firma un webhook de algo propio y lo manda
    // diciendo que es el pago de otro. El manifiesto ata la firma al id.
    const { verificarFirmaMP } = await import('../../src/server/lib/mercadopago.ts')
    const ts = Math.floor(Date.now() / 1000)
    assert.equal(verificarFirmaMP(firmar(ts, 'pay_propio', 'req_1'), 'req_1', 'pay_ajeno'), false)
  })

  it('rechaza una firma vieja', async () => {
    const { verificarFirmaMP } = await import('../../src/server/lib/mercadopago.ts')
    const viejo = Math.floor(Date.now() / 1000) - 3600
    assert.equal(verificarFirmaMP(firmar(viejo, 'pay_1', 'req_1'), 'req_1', 'pay_1'), false)
  })

  it('rechaza si falta el secreto configurado', async () => {
    const { verificarFirmaMP } = await import('../../src/server/lib/mercadopago.ts')
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
    const ts = Math.floor(Date.now() / 1000)
    // "No puedo verificar" tiene que ser NO, no "paso todo lo que llega".
    assert.equal(verificarFirmaMP(firmar(ts, 'pay_1', 'req_1'), 'req_1', 'pay_1'), false)
  })

  it('rechaza si falta cualquier encabezado', async () => {
    const { verificarFirmaMP } = await import('../../src/server/lib/mercadopago.ts')
    const ts = Math.floor(Date.now() / 1000)
    assert.equal(verificarFirmaMP(undefined, 'req_1', 'pay_1'), false)
    assert.equal(verificarFirmaMP(firmar(ts, 'pay_1', 'req_1'), undefined, 'pay_1'), false)
    assert.equal(verificarFirmaMP(firmar(ts, 'pay_1', 'req_1'), 'req_1', undefined), false)
  })
})
