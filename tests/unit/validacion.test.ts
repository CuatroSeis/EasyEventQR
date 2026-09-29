import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { esTrampa, validarRegistro } from '../../api/lib/validacion.ts'

/**
 * Tests de la validación del alta.
 *
 * Esta función es el CONTRATO de POST /api/registro. Todo lo que el
 * endpoint acepta y todo lo que devuelve con un 400 sale de acá, así que
 * los tests fijan tanto lo que tiene que entrar como lo que no.
 *
 * El body de una request es `unknown` a propósito: es cualquier cosa que
 * mande el otro lado. Estos tests mandan de todo.
 */

const VALIDO = {
  eventoId: 'evento-de-a',
  nombre: 'Juan Pérez',
  email: 'juan@ejemplo.com',
}

describe('validarRegistro: lo que tiene que entrar', () => {
  it('acepta un cuerpo completo y bien formado', () => {
    const resultado = validarRegistro({ ...VALIDO, telefono: '+5491100000000' })
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.deepEqual(resultado.datos, {
      eventoId: 'evento-de-a',
      nombre: 'Juan Pérez',
      email: 'juan@ejemplo.com',
      telefono: '+5491100000000',
      sitioWeb: '',
    })
  })

  it('acepta el cuerpo mínimo, sin teléfono', () => {
    const resultado = validarRegistro(VALIDO)
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.datos.telefono, '')
  })

  it('baja el correo a minúsculas', () => {
    // Sin esto, "Juan@Mail.com" y "juan@mail.com" serían dos personas
    // para cualquier deduplicación, y cambiar mayúsculas para esquivar
    // una comprobación sería gratis.
    const resultado = validarRegistro({ ...VALIDO, email: '  Juan.Perez@Ejemplo.COM  ' })
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.datos.email, 'juan.perez@ejemplo.com')
  })

  it('recorta los espacios de los textos', () => {
    const resultado = validarRegistro({ ...VALIDO, nombre: '  Juan Pérez  ' })
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.datos.nombre, 'Juan Pérez')
  })

  it('un nombre de un solo carácter no alcanza', () => {
    const resultado = validarRegistro({ ...VALIDO, nombre: 'J' })
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.problemas[0]?.campo, 'nombre')
  })

  it('un nombre de un byte no es un nombre', () => {
    // Un nombre de 81 caracteres pasa a ser contenido, no un nombre, y
    // es lo que más se usa para meter links.
    const resultado = validarRegistro({ ...VALIDO, nombre: 'a'.repeat(81) })
    assert.equal(resultado.ok, false)
  })

  it('exige un correo con forma de correo', () => {
    for (const email of ['no-es-un-correo', 'a@b', 'a@@b.com', 'a b@c.com', '']) {
      const resultado = validarRegistro({ ...VALIDO, email })
      assert.equal(resultado.ok, false, `debería rechazar ${JSON.stringify(email)}`)
    }
  })

  it('exige un eventoId que pueda existir en Firestore', () => {
    // Sin el regex, un eventoId con barra o espacio llega al get() de
    // Firestore y responde 500 en vez de un 400 con un mensaje.
    for (const eventoId of ['con barra/barra', 'con espacio', 'con#hash', '']) {
      const resultado = validarRegistro({ ...VALIDO, eventoId })
      assert.equal(resultado.ok, false, `debería rechazar ${JSON.stringify(eventoId)}`)
    }
  })

  it('rechaza todo lo que no es un objeto', () => {
    // El body de un POST puede ser un array, un string, un número o
    // null. Nada de eso es una reserva.
    for (const cuerpo of [null, undefined, 'texto', 42, true, ['a'], new Date()]) {
      const resultado = validarRegistro(cuerpo)
      assert.equal(resultado.ok, false, `debería rechazar ${JSON.stringify(cuerpo)}`)
    }
  })

  it('descarta los campos que no conoce, sin rechazarlos', () => {
    // Un cliente modificado mandando `plan: 'pro+'` o `usado: false`
    // tiene que ser un 200 con un cuerpo limpio, no un error. Dos
    // razones: romperse con un 400 por un campo extra castigaría a un
    // cliente legítimo que mande algo de analítica, y lo que importa
    // para la seguridad no es rechazar, es que esos campos NO LLEGUEN
    // al documento. Eso se comprueba abajo.
    const resultado = validarRegistro({ ...VALIDO, plan: 'pro+', usado: false, Reserves: 9999 })
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.deepEqual(Object.keys(resultado.datos).sort(), ['email', 'eventoId', 'nombre', 'sitioWeb', 'telefono'])
  })

  it('el cuerpo validado no arrastra NADA del input', () => {
    // El endpoint escribe este objeto, no el body de la request. Es lo
    // que hace que un campo extra no pueda convertirse en un campo del
    // documento, y por eso no hace falta `.strict()`.
    const resultado = validarRegistro({ ...VALIDO, creadoEn: '2020-01-01', token: 'x',qrHash: 'y' })
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    for (const prohibido of ['creadoEn', 'token', 'qrHash', 'plan', 'usado', 'organizadorId']) {
      assert.ok(
        !JSON.stringify(resultado.datos).includes(prohibido),
        `${prohibido} no puede viajar en el cuerpo validado`,
      )
    }
  })

  it('acota el tamaño de los textos', () => {
    // Un nombre de 10 MB pasa la validación de tipo de zod si no hay un
    // max(), y después viaja al documento y de ahí al CSV de la Fase 6.
    const resultado = validarRegistro({ ...VALIDO, telefono: '9'.repeat(33) })
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    assert.equal(resultado.problemas[0]?.campo, 'telefono')
  })

  it('devuelve todos los problemas juntos, no sólo el primero', () => {
    // El formulario los muestra todos de una, en vez de obligar al
    // usuario a mandar tres requests para descubrir tres errores. Se
    // comparan los CAMPOS distintos y no la cantidad de issues: zod
    // puede reportar dos problemas para el mismo campo (una regla por
    // vez) y eso no es un error de esta función.
    const resultado = validarRegistro({ eventoId: '', nombre: '', email: 'x' })
    assert.equal(resultado.ok, false)
    if (resultado.ok) return
    const campos = [...new Set(resultado.problemas.map((p) => p.campo))].sort()
    assert.deepEqual(campos, ['email', 'eventoId', 'nombre'])
  })
})

describe('validarRegistro: la trampa', () => {
  it('un campo trampa lleno NO es un error de validación', () => {
    // La diferencia más importante de este archivo. Si llenarlo fuera un
    // error, el endpoint devolvería 400 y el bot sabría que lo
    // detectaron, y empieza a probar con el campo vacío. Tiene que
    // pasar la validación y morir más adelante, en esTrampa().
    const resultado = validarRegistro({ ...VALIDO, sitioWeb: 'https://spam.example.com' })
    assert.equal(resultado.ok, true)
    if (!resultado.ok) return
    assert.equal(resultado.datos.sitioWeb, 'https://spam.example.com')
  })

  it('esTrampa detecta el campo lleno', () => {
    assert.equal(esTrampa({ sitioWeb: 'https://spam.example.com' }), true)
    assert.equal(esTrampa({ sitioWeb: 'comprar entradas baratas' }), true)
  })

  it('esTrampa ignora los espacios en blanco', () => {
    // Un bot que mande " " tiene que caer igual: si no, esquivaría la
    // trampa con el mismo esfuerzo que mandarla llena.
    assert.equal(esTrampa({ sitioWeb: '' }), false)
    assert.equal(esTrampa({ sitioWeb: '   ' }), false)
    assert.equal(esTrampa({ sitioWeb: '\n\t ' }), false)
  })
})
