import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ipDelVisitante, resolverBasePublica, urlQrDe } from '../../src/server/lib/url.ts'

/**
 * Tests de la URL del QR.
 *
 * El QR escanea a esta URL, y no hay forma de que un error acá avise: el
 * QR se dibuja igual de lindo, se manda igual, y el asistente llega a
 * `/q/undefined` o a `http://localhost` en producción. Estos tests son la
 * única red que hay.
 */

const TOKEN = 'Xk7-_q9ZpL2vB4nR8tYcW1dF3gH6jK0mN5qS7xA'

describe('ipDelVisitante', () => {
  it('toma el primer salto de x-forwarded-for', () => {
    // El primero lo puso el cliente y el último, Vercel. Usar el último
    // dejaría que un atacante eligiera qué documento del limitador pisa.
    const ip = ipDelVisitante({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })
    assert.equal(ip, '203.0.113.7')
  })

  it('prefiere x-vercel-forwarded-for', () => {
    // La que pone la plataforma y no se puede falsear desde afuera.
    const ip = ipDelVisitante({
      'x-vercel-forwarded-for': '198.51.100.9',
      'x-forwarded-for': '10.0.0.1',
    })
    assert.equal(ip, '198.51.100.9')
  })

  it('desenvuelve una IPv6 entre corchetes', () => {
    assert.equal(ipDelVisitante({ 'x-forwarded-for': '[2001:db8::1]:443' }), '2001:db8::1')
  })

  it('devuelve null si no hay ninguna', () => {
    // null y no '' ni '0.0.0.0': el endpoint usa null para caer en el
    // contador compartido, y una cadena vacía hashearía un documento
    // distinto por cada request sin cabecera.
    assert.equal(ipDelVisitante({}), null)
    assert.equal(ipDelVisitante({ 'x-forwarded-for': '' }), null)
    assert.equal(ipDelVisitante({ 'x-forwarded-for': '  ' }), null)
  })

  it('aguanta que la cabecera sea un arreglo', () => {
    assert.equal(ipDelVisitante({ 'x-forwarded-for': ['203.0.113.7', '10.0.0.1'] }), '203.0.113.7')
  })
})

describe('resolverBasePublica', () => {
  it('usa APP_URL si está', () => {
    // Es la fuente de verdad en producción: el Host lo manda el cliente
    // y se puede falsear.
    const base = resolverBasePublica({ host: 'evil.example.com' }, { APP_URL: 'https://easyeventqr.com.ar' })
    assert.equal(base, 'https://easyeventqr.com.ar')
  })

  it('limpia la barra final de APP_URL', () => {
    // Un trailing slash acá produce `//q/token`, que es una URL
    // distinta: algunos navegadores la toman como otro origen y el
    // redirect se come la ruta.
    const base = resolverBasePublica({}, { APP_URL: 'https://easyeventqr.com.ar///' })
    assert.equal(base, 'https://easyeventqr.com.ar')
  })

  it('usa VERCEL_URL si no hay APP_URL', () => {
    // En un preview, VERCEL_URL es el dominio del preview: es lo
    // correcto, porque un QR con el dominio de producción dentro de un
    // preview no valida.
    const base = resolverBasePublica({}, { VERCEL_URL: 'easyeventqr-abc123.vercel.app' })
    assert.equal(base, 'https://easyeventqr-abc123.vercel.app')
  })

  it('cae en el Host con https por defecto', () => {
    const base = resolverBasePublica({ host: 'localhost:3000' })
    assert.equal(base, 'https://localhost:3000')
  })

  it('respeta un x-forwarded-proto que diga http', () => {
    // El caso de `vercel dev` y de un proxy interno: si se fuerza https
    // en un entorno que habla http, la página no carga y parece un error
    // de la app.
    const base = resolverBasePublica({ host: 'localhost:3000', 'x-forwarded-proto': 'http' })
    assert.equal(base, 'http://localhost:3000')
  })

  it('devuelve string vacío si no hay de dónde sacarla', () => {
    // El endpoint tiene que quemarlo sin romperse: si la base es '', la
    // URL es relativa (`/q/token`) y el mail igual llega.
    assert.equal(resolverBasePublica({}), '')
  })
})

describe('urlQrDe', () => {
  it('arma la ruta del QR', () => {
    assert.equal(urlQrDe(TOKEN, 'https://easyeventqr.com.ar'), `https://easyeventqr.com.ar/q/${TOKEN}`)
  })

  it('no duplica la barra si la base la trae', () => {
    assert.equal(urlQrDe(TOKEN, 'https://easyeventqr.com.ar/'), `https://easyeventqr.com.ar/q/${TOKEN}`)
  })

  it('con base vacía devuelve una ruta relativa', () => {
    // O sea que el mismo código sirve para un link del mail y para un
    // link dentro de la app.
    assert.equal(urlQrDe(TOKEN, ''), `/q/${TOKEN}`)
  })

  it('agrega el eventoId cuando viene', () => {
    // Sin esto, un QR del evento A validaría en la pantalla del evento B:
    // el único control sería que quien escanea mire la puerta.
    const url = urlQrDe(TOKEN, 'https://easyeventqr.com.ar', 'charla-de-ia')
    assert.equal(url, `https://easyeventqr.com.ar/q/${TOKEN}?eventoId=charla-de-ia`)
  })

  it('el eventoId va escapado', () => {
    const url = urlQrDe(TOKEN, 'https://x.com', 'a b&c')
    assert.ok(!url.includes('a b'), 'un id raro no puede romper la URL')
    assert.ok(url.includes('a%20b%26c'))
  })

  it('sin eventoId la URL es la de siempre', () => {
    // Backwards compatible: los QR emitidos antes de esto siguen
    // apuntando a algo que el validador entiende.
    assert.equal(urlQrDe(TOKEN, 'https://x.com'), `https://x.com/q/${TOKEN}`)
  })

  it('el token va crudo, sin escapear', () => {
    // base64url no tiene caracteres que rompan una URL, y escapearlo
    // produciría `%2D` en algunos clientes de correo. Peor: si algún día
    // el token tuviera un `%`, escapearlo bien y mal daría tokens
    // distintos y la validación fallaría sin explicación.
    const url = urlQrDe('a-b_c', 'https://x.com')
    assert.equal(url, 'https://x.com/q/a-b_c')
  })
})
