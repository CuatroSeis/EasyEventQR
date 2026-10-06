import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  aplicarTema,
  colorDeTextoSobre,
  esColorValido,
  type RaizCss,
} from '../../src/shared/theming.ts'

/**
 * Tests de las funciones puras del theming.
 *
 * No necesitan el emulador, asi que corren en milisegundos.
 *
 * aplicarTema si toca algo que parece DOM, pero el tipo que pide
 * (RaizCss) es estructural: dos metodos de `style`. Eso permite testearlo
 * con un doble falso sin jsdom, que no esta en las dependencias y no
 * vale la pena agregar por dos metodos. Y no es un test de adorno: la
 * semantica de null (que BORRA la variable, en vez de no hacer nada) fue
 * un bug real, asi que queda fijada por test.
 */

describe('esColorValido', () => {
  it('acepta hex de 6 dígitos', () => {
    for (const color of ['#2563eb', '#000000', '#ffffff', '#AABBCC']) {
      assert.equal(esColorValido(color), true, `debería aceptar ${color}`)
    }
  })

  it('acepta hex corto de 3 dígitos', () => {
    for (const color of ['#abc', '#0f0', '#FFF']) {
      assert.equal(esColorValido(color), true, `debería aceptar ${color}`)
    }
  })

  it('no acepta nombres de color', () => {
    // El input type="color" del navegador siempre devuelve hex, pero un
    // documento de Firestore puede traer lo que alguien escribiera a mano
    // desde la consola. 'red' tiene que ser rechazado, no escrito en la
    // variable: si pasara, el resto del CSS leería var(--c-primario) y
    // no sabría qué hacer con "red"... en realidad el navegador lo
    // aceptaría, que es exactamente el problema.
    for (const valor of ['red', 'rgb(255,0,0)', 'azul', 'transparent']) {
      assert.equal(esColorValido(valor), false, `debería rechazar ${valor}`)
    }
  })

  it('no acepta hex mal formado', () => {
    for (const valor of ['#12345', '#gggggg', '2563eb', '#2563ebff', '']) {
      assert.equal(
        esColorValido(valor),
        false,
        `debería rechazar ${JSON.stringify(valor)}`,
      )
    }
  })

  it('tolera espacios alrededor, porque el usuario pega el color', () => {
    // Deliberado: el campo de texto del formulario deja escribir y lo
    // más común es pegar " #2563eb " con un espacio de más. Rechazarlo
    // haría que el usuario pensara que el color no anda, cuando lo único
    // que hay es un espacio. El trim ocurre antes de validar y antes de
    // escribir la variable CSS.
    assert.equal(esColorValido('  #2563eb '), true)
    assert.equal(esColorValido('\n#fff\t'), true)
  })

  it('no acepta null ni undefined', () => {
    // El caso real: un organizador que nunca tocó el branding tiene
    // colorPrimario en null, y eso no es un color inválido a proposito,
    // es la señal de "usá el default".
    assert.equal(esColorValido(null), false)
    assert.equal(esColorValido(undefined), false)
  })
})

describe('colorDeTextoSobre', () => {
  it('pone texto oscuro sobre colores claros', () => {
    // El caso que motivó la función: un organizador con amarillo claro
    // recibía botones amarillos con texto blanco, ilegibles.
    for (const color of ['#fbbf24', '#fde047', '#ffffff', '#22c55e']) {
      assert.equal(
        colorDeTextoSobre(color),
        '#0f172a',
        `debería poner texto oscuro sobre ${color}`,
      )
    }
  })

  it('pone texto blanco sobre colores oscuros', () => {
    for (const color of ['#1e293b', '#2563eb', '#dc2626', '#000000']) {
      assert.equal(
        colorDeTextoSobre(color),
        '#ffffff',
        `debería poner texto blanco sobre ${color}`,
      )
    }
  })

  it('el hex corto se calcula como si estuviera extendido', () => {
    // Si no se extendiera, '#fff' se leería como un solo canal de 3
    // caracteres y la luminancia daría un número sin sentido. '#fff' y
    // '#ffffff' tienen que dar exactamente el mismo texto.
    assert.equal(colorDeTextoSobre('#fff'), colorDeTextoSobre('#ffffff'))
    assert.equal(colorDeTextoSobre('#000'), colorDeTextoSobre('#000000'))
  })

  it('el resultado siempre es uno de los dos valores, nunca otro', () => {
    // La función devuelve literales, no un color calculado. Si alguna vez
    // empezara a calcular un gris intermedio, los botones dejarían de
    // tener contraste garantizado y nadie lo notaría mirando la UI.
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const color = `#${r.toString(16).padStart(2, '0')}${g
            .toString(16)
            .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
          const resultado = colorDeTextoSobre(color)
          assert.ok(
            resultado === '#ffffff' || resultado === '#0f172a',
            `colorDeTextoSobre(${color}) devolvió ${resultado}`,
          )
        }
      }
    }
  })
})

/**
 * Doble falso de RaizCss.
 *
 * Se implementa con un Map en vez de con jsdom a proposito: lo que
 * aplicarTema necesita es `style.setProperty` y `style.removeProperty`, y
 * un Map registra exactamente las llamadas. Si la implementacion
 * empezara a tocar algo mas del elemento, este doble no lo soporta y el
 * typecheck lo avisa, que es justo lo que se quiere.
 */
function raizFalsa() {
  const props = new Map<string, string>()
  const raiz: RaizCss = {
    style: {
      setProperty(propiedad, valor) {
        props.set(propiedad, valor)
      },
      removeProperty(propiedad) {
        props.delete(propiedad)
      },
    },
  }
  return { raiz, props }
}

describe('aplicarTema', () => {
  it('undefined no toca nada', () => {
    // Es el caso de un evento recien creado, que todavia no tiene
    // personalizacion. No escribir es lo correcto: escribir "" dejaria
    // --c-primario vacio y todos los botones sin fondo.
    const { raiz, props } = raizFalsa()
    aplicarTema(undefined, raiz)
    assert.equal(props.size, 0)
  })

  it('escribe el primario y calcula el color de texto', () => {
    const { raiz, props } = raizFalsa()
    aplicarTema({ colorPrimario: '#fbbf24', colorSecundario: '#0f172a' }, raiz)

    assert.equal(props.get('--c-primario'), '#fbbf24')
    // El amarillo claro necesita texto oscuro, y eso no lo decide el
    // documento: lo decide colorDeTextoSobre. Si no se escribiera
    // --c-sobre-primario, el boton quedaria con el texto del :root
    // (blanco) sobre amarillo, ilegible.
    assert.equal(props.get('--c-sobre-primario'), '#0f172a')
    assert.equal(props.get('--c-secundario'), '#0f172a')
  })

  it('el trim ocurre antes de escribir la variable', () => {
    // Si se escribiera el valor sin trimar, el CSS recibe
    // "--c-primario: #2563eb " con el espacio. El navegador lo acepta, pero
    // el test previo y la regla de Firestore no: aqui se documenta que
    // la normalizacion ocurre en un solo lugar.
    const { raiz, props } = raizFalsa()
    aplicarTema({ colorPrimario: '  #2563eb  ', colorSecundario: null }, raiz)
    assert.equal(props.get('--c-primario'), '#2563eb')
  })

  it('ignora un color invalido en vez de escribirlo', () => {
    // El input type=color del navegador nunca devuelve esto, pero el
    // documento de Firestore puede traer lo que alguien escribio a mano
    // desde la consola. Escribir "rojo" en --c-primario deja el boton
    // sin color y nadie sabe por que.
    const { raiz, props } = raizFalsa()
    aplicarTema({ colorPrimario: 'rojo', colorSecundario: 'azul' }, raiz)
    assert.equal(props.size, 0)
  })

  it('null BORRA la variable, y no la deja pegada', () => {
    // Esta es la regresion que importa. Antes, null caia en el mismo
    // caso que undefined y no hacia nada: un organizador que se habia
    // puesto #dc2626 y despues sacaba el color se quedaba con el rojo
    // en el documentElement para siempre, sin forma de limpiarlo salvo
    // recargar la pagina. removeProperty() es lo unico que devuelve la
    // variable al valor del :root.
    const { raiz, props } = raizFalsa()
    props.set('--c-primario', '#dc2626')
    props.set('--c-sobre-primario', '#ffffff')
    props.set('--c-secundario', '#111827')

    aplicarTema({ colorPrimario: null, colorSecundario: null }, raiz)

    assert.equal(props.has('--c-primario'), false)
    assert.equal(props.has('--c-secundario'), false)
    // Tambien la de contraste, que es la que nadie recuerda: si queda
    // --c-sobre-primario: #ffffff pegada y despues el primario vuelve a
    // ser un color claro, el texto se lee mal.
    assert.equal(props.has('--c-sobre-primario'), false)
    assert.equal(props.size, 0)
  })

  it('un null en un campo no borra el otro', () => {
    // Si el organizador saca el secundario pero mantiene el primario,
    // se queda sin secundario y conserva su color.
    const { raiz, props } = raizFalsa()
    aplicarTema({ colorPrimario: '#2563eb', colorSecundario: null }, raiz)
    assert.equal(props.get('--c-primario'), '#2563eb')
    assert.equal(props.has('--c-secundario'), false)
  })

  it('aplicar un tema dos veces no acumula basura', () => {
    // El useEffect de PanelLayout corre con cada cambio de branding. Si
    // el tema se reaplica, las variables tienen que quedar en el estado
    // nuevo, no acumular las viejas.
    const { raiz, props } = raizFalsa()
    aplicarTema({ colorPrimario: '#dc2626', colorSecundario: '#111827' }, raiz)
    aplicarTema({ colorPrimario: '#16a34a', colorSecundario: null }, raiz)

    assert.equal(props.get('--c-primario'), '#16a34a')
    // Ojo con este valor, porque parece obvio y no lo es. El verde
    // #16a34a con texto blanco da 3.30:1, que NO alcanza el 4.5:1 que
    // pide WCAG AA para texto normal; con texto oscuro da 5.39:1 y pasa.
    // Por eso el resultado es #0f172a y no #ffffff. Un "azul y blanco"
    // a olho habria dejado el boton FAILando el contraste.
    assert.equal(props.get('--c-sobre-primario'), '#0f172a')
    assert.equal(props.has('--c-secundario'), false)
  })
})

describe('presets de landing', () => {
  it('un tema desconocido se ignora (default del sistema)', async () => {
    const { resolverColores } = await import('../../src/shared/theming.ts')
    const r = resolverColores({ colorPrimario: null, colorSecundario: null, tema: 'xss' })
    assert.equal(r.colorPrimario, null)
    assert.equal(r.superficie, null)
  })

  it('el preset pinta los 6 vars cuando no hay custom', async () => {
    const { resolverColores, PRESETS } = await import('../../src/shared/theming.ts')
    for (const clave of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
      const r = resolverColores({ colorPrimario: null, colorSecundario: null, tema: clave })
      assert.equal(r.colorPrimario, PRESETS[clave].paleta.colorPrimario)
      assert.equal(r.superficie, PRESETS[clave].paleta.superficie)
      assert.equal(r.texto, PRESETS[clave].paleta.texto)
    }
  })

  it('el color custom manda sobre el preset', async () => {
    const { resolverColores, PRESETS } = await import('../../src/shared/theming.ts')
    const r = resolverColores({ colorPrimario: '#123456', colorSecundario: null, tema: 'neon' })
    assert.equal(r.colorPrimario, '#123456')
    assert.equal(r.colorSecundario, PRESETS.neon.paleta.colorSecundario)
  })

  it('sin preset ni custom no se toca nada (null = default)', async () => {
    const { resolverColores } = await import('../../src/shared/theming.ts')
    const r = resolverColores({ colorPrimario: null, colorSecundario: null, tema: null })
    assert.deepEqual(r, {
      colorPrimario: null,
      colorSecundario: null,
      superficie: null,
      texto: null,
      textoSuave: null,
      borde: null,
    })
  })

  it('aplicarTema escribe los vars extra del preset', async () => {
    const { aplicarTema, resolverColores } = await import('../../src/shared/theming.ts')
    const escrito: Record<string, string> = {}
    const raiz = {
      style: {
        setProperty: (k: string, v: string) => { escrito[k] = v },
        removeProperty: (k: string) => { delete escrito[k] },
      },
    }
    aplicarTema(resolverColores({ colorPrimario: null, colorSecundario: null, tema: 'neon' }), raiz)
    assert.equal(escrito['--c-superficie'], '#0f172a')
    assert.equal(escrito['--c-primario'], '#e879f9')
    // El texto sobre el primario neón se calcula, no se hardcodea.
    assert.ok(escrito['--c-sobre-primario'] === '#0f172a' || escrito['--c-sobre-primario'] === '#ffffff')
  })
})
