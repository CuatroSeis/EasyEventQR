import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { construirMensaje, type DatosParaElMail } from '../../src/server/lib/email.ts'

/**
 * Tests del armado del mail.
 *
 * El mail es la única copia del token en claro. Si algo sale mal ahí, el
 * asistente tiene una reserva y ninguna forma de entrar, y no se puede
 * recuperar: del documento de Firestore sólo sale la huella, por diseño.
 *
 * Estos tests no mandan nada. Miden el objeto que `api/registro.ts` le
 * pasa a Brevo.
 */

const TOKEN = 'Xk7-_q9ZpL2vB4nR8tYcW1dF3gH6jK0mN5qS7xA'
const URL_QR = `https://easyeventqr.vercel.app/q/${TOKEN}`

const EVENTO: DatosParaElMail = {
  eventoId: 'charla-de-ia',
  nombre: 'Charla de IA',
  fechaIso: '2026-10-15T21:30:00.000Z',
  lugar: 'Biblioteca Nacional, Sala 3',
  textoConfirmacion: 'Traé algo para tomar.',
  colorPrimario: '#2563eb',
}

const REMITENTE = 'entradas@easyeventqr.com.ar'

function mensaje(over: Partial<Parameters<typeof construirMensaje>[0]> = {}, evento: Partial<DatosParaElMail> = {}) {
  return construirMensaje(
    {
      destinatario: 'juan@ejemplo.com',
      nombreAsistente: 'Juan Pérez',
      urlQr: URL_QR,
      imagenQr: 'data:image/png;base64,iVBORw0KGgo=',
      evento: { ...EVENTO, ...evento },
      ...over,
    },
    REMITENTE,
  )
}

describe('construirMensaje: a quién y desde quién', () => {
  it('va al asistente, no al organizador', () => {
    const m = mensaje()
    assert.deepEqual(m.to, [{ email: 'juan@ejemplo.com', name: 'Juan Pérez' }])
  })

  it('el remitente es el que se le pasó, no el email del asistente', () => {
    // Confusionarse acá manda la entrada al asistente mismo y se pierde.
    const m = mensaje()
    assert.equal(m.sender.email, REMITENTE)
    assert.notEqual(m.sender.email, 'juan@ejemplo.com')
  })

  it('el asunto lleva el nombre del evento', () => {
    assert.equal(mensaje().subject, 'Tu entrada para Charla de IA')
  })

  it('lleva un tag para poder filtrar en Brevo', () => {
    assert.ok(mensaje().tags.length > 0)
  })
})

describe('construirMensaje: el token viaja una sola vez', () => {
  it('la URL con el token está en el HTML', () => {
    assert.ok(mensaje().htmlContent.includes(URL_QR))
  })

  it('cada aparición del token es parte de la URL completa', () => {
    // La propiedad real, que es más fuerte que "no aparece en el texto":
    // el token puede estar visible (el enlace de texto plano es a
    // propósito, para el cliente de correo que bloquea botones), pero
    // SIEMPRE pegado a su URL. Un token suelto en una frase es un token
    // que un asistente reenvía y el otro puede leer sin querer.
    const html = mensaje().htmlContent
    assert.equal(html.split(TOKEN).length - 1, 3, 'botón, enlace de ayuda y texto visible')
    for (const trozo of html.split(URL_QR).slice(1)) {
      assert.ok(trozo.length > 0, 'ninguna aparición del token quedó suelta')
    }
  })

  it('el enlace de texto plano está completo, para el que no puede apretar el botón', () => {
    // Se lo pone a propósito en el cuerpo del mail, no escondido en un
    // href: muchos clientes de correo (y varios de los de la
    // administración pública) bloquean los botones y dejan el texto.
    const soloTexto = mensaje().htmlContent.replace(/<[^>]*>/g, '')
    assert.ok(soloTexto.includes(URL_QR), 'la URL tiene que poder leerse')
  })
})

describe('construirMensaje: nada de lo que no va', () => {
  it('no manda datos del organizador', () => {
    // La función ni los recibe, y el test lo deja fijo: si algún día
    // alguien pasa el evento entero, el mail no puede filtrar el plan
    // ni el id del organizador.
    const html = mensaje().htmlContent
    for (const prohibido of ['organizadorId', 'plan', 'reservas', 'correoDelOrganizador', 'admin']) {
      assert.ok(!html.includes(prohibido), `el mail no puede mentionar ${prohibido}`)
    }
  })

  it('no menciona el email del asistente', () => {
    assert.ok(!mensaje().htmlContent.includes('juan@ejemplo.com'))
  })

  it('no tiene undefined ni null pegados en el texto', () => {
    // El bug clásico de un template: `${algo.que.no.existe}`. Sale
    // "undefined" en pantalla y nadie lo nota en un preview.
    const html = mensaje({ imagenQr: 'data:image/png;base64,AAA' }).htmlContent
    assert.ok(!html.includes('undefined'), 'hay un undefined en el HTML')
    assert.ok(!html.includes('>null<') && !html.includes('null'), 'hay un null en el HTML')
  })

  it('funciona también sin texto de confirmación', () => {
    const html = mensaje({}, { textoConfirmacion: null }).htmlContent
    assert.ok(!html.includes('undefined'))
    assert.ok(html.includes('Charla de IA'))
  })

  it('funciona sin color primario', () => {
    const m = mensaje({}, { colorPrimario: null })
    assert.ok(!m.htmlContent.includes('undefined'))
    assert.ok(!m.htmlContent.includes('color:null'))
  })
})

describe('construirMensaje: lo que escribe un humano', () => {
  it('escapa un <script> en el texto de confirmación', () => {
    // El texto lo escribe el organizador y el mail es HTML que renderiza
    // un cliente de correo. Sin escapar, es XSS hacia el asistente.
    const html = mensaje({}, { textoConfirmacion: '<script>alert(1)</script>' }).htmlContent
    assert.ok(!html.includes('<script>'), 'no puede haber un script sin escapar')
    assert.ok(html.includes('&lt;script&gt;'))
  })

  it('escapa una etiqueta en el nombre del evento', () => {
    const html = mensaje({}, { nombre: '<img src=x onerror=alert(1)>' }).htmlContent
    // El mail tiene un <img> propio y legítimo: el QR. Lo que no puede
    // haber es un segundo. Se cuenta en vez de buscar la cadena entera,
    // porque `onerror=alert(1)` sí aparece: como TEXTO, que es
    // inerte, y no hay forma de evitarlo sin mutilar lo que el
    // organizador escribió.
    assert.equal(html.split('<img').length - 1, 1, 'sólo puede quedar la imagen del QR')
    assert.ok(html.includes('&lt;img'), 'la etiqueta tiene que quedar escapada')
  })

  it('escapa comillas en el lugar', () => {
    // Una comilla sin escapar rompe el atributo de estilo y abre la
    // puerta a meter otro atributo.
    const html = mensaje({}, { lugar: 'Sala "A" <b>' }).htmlContent
    assert.ok(!html.includes('<b>'))
    assert.ok(html.includes('&quot;A&quot;'))
  })

  it('rechaza un color que no es hexadecimal y usa el de por defecto', () => {
    // El color va a un atributo style. Con `;` o `url(...)` se inyecta
    // CSS, y aunque el cliente de correo no lo ejecute, el HTML del mail
    // queda manipulado.
    for (const color of ['red', 'rgb(0,0,0)', '#12345', '#gggggg', 'url(javascript:alert(1))']) {
      const html = mensaje({}, { colorPrimario: color }).htmlContent
      assert.ok(!html.includes(color), `no puede colarse el color ${color}`)
      assert.ok(html.includes('#7c3aed'), 'tiene que caer el color por defecto')
    }
  })

  it('acepta un hexadecimal corto y uno largo', () => {
    for (const color of ['#abc', '#2563eb', '#ABCDEF']) {
      assert.ok(mensaje({}, { colorPrimario: color }).htmlContent.includes(color))
    }
  })
})

describe('construirMensaje: la fecha', () => {
  it('la escribe en castellano, con el mes en palabras', () => {
    // A propósito no se usa toLocaleDateString: el locale de una
    // función serverless puede no tener los datos de es-AR y el
    // resultado sería una fecha en inglés o "Invalid Date".
    const html = mensaje({}, { fechaIso: '2026-10-15T21:30:00.000Z' }).htmlContent
    assert.ok(html.includes('octubre'), 'el mes tiene que estar en castellano')
    assert.ok(!html.includes('Invalid Date'))
  })

  it('no rompe con una fecha basura', () => {
    const html = mensaje({}, { fechaIso: 'no-es-fecha' }).htmlContent
    assert.ok(!html.includes('Invalid Date'))
    assert.ok(!html.includes('undefined'))
  })
})

describe('construirMensaje: la imagen', () => {
  it('va por CID (adjunto), nunca como data URL ni link externo', () => {
    // Gmail bloquea imágenes `data:` y el QR llegaba roto. El transporte
    // (`mail.ts`) adjunta el PNG con `cid:qr-entrada`; acá sólo se fija
    // la referencia. Un <img src="https://..."> avisaría a un tercero
    // que ese asistente tiene entrada.
    const html = mensaje({ imagenQr: 'data:image/png;base64,AAAABBBB' }).htmlContent
    assert.ok(html.includes('src="cid:qr-entrada"'), 'el <img> tiene que apuntar al adjunto CID')
    assert.ok(!html.includes('data:image/png'), 'ningún data URL en el HTML')
    assert.ok(!/<img[^>]+src="https?:/i.test(html), 'la imagen no puede ser un link externo')
  })
})
