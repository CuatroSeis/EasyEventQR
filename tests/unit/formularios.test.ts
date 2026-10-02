import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard de `preventDefault()` en los formularios.
 *
 * El bug que motivo todo esto: en `Branding.tsx` el `<form onSubmit={enviar}>` iba
 * con un `enviar()` que no recibía el evento ni llamaba a `preventDefault()`.
 * El navegador hacía el submit nativo, recargaba la página, y el `updateDoc`
 * a medio camino se cancelaba. El síntoma era "se reinicia y no guarda",
 * que no señalaba ni una línea cerca de la causa.
 *
 * Por qué es un test y no una regla de lint: reproducir el efecto real
 * necesita un DOM (el repo corre `node --test`, sin React Testing Library),
 * y una regla de lint no puede saber si el handler referenciado es el que
 * se pasa. Lo que sí se puede verificar sin browser es la propiedad
 * estructural que hace inevitable el bug: si el handler de `onSubmit` no
 * llama a `preventDefault()`, el submit nativo va a pasar.
 *
 * Es un análisis textual, no un parser de AST: se conforma con que el
 * handler esté en el mismo archivo y con dos formas de declararlo. Si
 * alguno vez se pasa un handler importado de otro archivo, este test
 * avisa en vez de fingir que todo bien.
 */

const RAIZ = join(process.cwd(), 'src')

function archivosTsx(dir: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...archivosTsx(ruta))
    else if (entrada.name.endsWith('.tsx')) salida.push(ruta)
  }
  return salida
}

/**
 * Cuerpo de una función declarada en el archivo, por conteo de llaves.
 *
 * Devuelve `null` si no la encuentra. El conteo de llaves es feo pero es
 * el que no depende de parsear TypeScript con un parser que no tenemos
 * como dependencia.
 */
function cuerpoDeFuncion(fuente: string, nombre: string): string | null {
  // `function enviar(` y `const enviar = (`
  const patrones = [
    new RegExp(`function\\s+${nombre}\\s*\\(`),
    new RegExp(`(?:const|let)\\s+${nombre}\\s*[:=]`),
  ]

  for (const patron of patrones) {
    const m = patron.exec(fuente)
    if (!m) continue

    const desde = fuente.indexOf('{', m.index)
    if (desde === -1) continue

    let profundidad = 0
    for (let i = desde; i < fuente.length; i++) {
      if (fuente[i] === '{') profundidad++
      else if (fuente[i] === '}') {
        profundidad--
        if (profundidad === 0) return fuente.slice(desde, i + 1)
      }
    }
  }
  return null
}

describe('los formularios no hacen submit nativo', () => {
  const archivos = archivosTsx(RAIZ)
  const revisados: string[] = []

  for (const ruta of archivos) {
    const fuente = readFileSync(ruta, 'utf8')
    const usos = [...fuente.matchAll(/onSubmit=\{\(?([^})]+?)\)?\}/g)]
    if (usos.length === 0) continue

    for (const uso of usos) {
      const bruto = uso[1].trim()
      const relativo = ruta.replace(`${RAIZ}/`, '')

      // Handler en línea: el cuerpo está en el mismo match.
      if (bruto.startsWith('(') || bruto.includes('=>')) {
        assert.ok(
          uso[0].includes('preventDefault'),
          `${relativo}: el onSubmit en línea no llama a preventDefault():\n  ${uso[0]}`,
        )
        continue
      }

      // Handler por nombre.
      const cuerpo = cuerpoDeFuncion(fuente, bruto)
      assert.ok(
        cuerpo !== null,
        `${relativo}: onSubmit={{${bruto}}} no encontré la función "${bruto}" en el archivo. ` +
          'Si el handler viene de otro módulo, este test ya no lo puede verificar: ' +
          'mové la función a este archivo o cubrilo con un test propio.',
      )
      assert.ok(
        cuerpo!.includes('preventDefault'),
        `${relativo}: "${bruto}" es el handler de un <form> y no llama a preventDefault(). ` +
          'Sin eso, el navegador recarga la página y se pierde el guardado.',
      )
      revisados.push(`${relativo}:${bruto}`)
    }
  }

  it('hubo algo que revisar', () => {
    // Si `revisados` queda vacío, el test pasa por no haber encontrado
    // ningún formulario: verde falso. Con esto se rompe solo si la app
    // se queda sin formularios, que sí es un cambio a mirar.
    assert.ok(
      revisados.length > 0,
      'No encontré ningún <form onSubmit> en src/. O la app perdió los formularios, o el analizador textual se rompió.',
    )
  })
})