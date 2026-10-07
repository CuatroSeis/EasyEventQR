import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  STRINGS,
  detectarIdioma,
  leerIdioma,
  traducir,
  type ClaveTexto,
} from '../../src/shared/i18n.ts'
import { temaInicial } from '../../src/shared/tema.ts'

/**
 * Tema e idioma sin DOM.
 *
 * `tema.ts` e `i18n.ts` no tocan `window`/`document` directo (los tests se
 * typecheckean sin la lib DOM): toda lectura va con guards y lo testeable
 * es puro.
 */
describe('temaInicial', () => {
  it('la guardada manda sobre el sistema', () => {
    assert.equal(temaInicial('oscuro', false), 'oscuro')
    assert.equal(temaInicial('claro', true), 'claro')
  })

  it('sin guardada vale el sistema', () => {
    assert.equal(temaInicial(null, true), 'oscuro')
    assert.equal(temaInicial(null, false), 'claro')
  })

  it('valor inválido se ignora y vale el sistema', () => {
    assert.equal(temaInicial('azul', false), 'claro')
    assert.equal(temaInicial('azul', true), 'oscuro')
  })
})

describe('detectarIdioma', () => {
  it('en* es inglés, todo lo demás español', () => {
    assert.equal(detectarIdioma('en-US'), 'en')
    assert.equal(detectarIdioma('en'), 'en')
    assert.equal(detectarIdioma('es-AR'), 'es')
    assert.equal(detectarIdioma('pt-BR'), 'es')
    assert.equal(detectarIdioma(undefined), 'es')
    assert.equal(detectarIdioma(''), 'es')
  })
})

describe('leerIdioma', () => {
  it('en node sin storage refleja el navegador', () => {
    const nav = (globalThis as any)?.navigator?.language as string | undefined
    assert.equal(leerIdioma(), detectarIdioma(nav))
  })
})

describe('diccionario', () => {
  it('toda clave existe en es y en en, no vacía', () => {
    const claves = Object.keys(STRINGS) as ClaveTexto[]
    assert.ok(claves.length > 50, 'el diccionario debería crecer, no achicarse')
    for (const clave of claves) {
      assert.ok(STRINGS[clave].es.length > 0, `${clave} sin es`)
      assert.ok(STRINGS[clave].en.length > 0, `${clave} sin en`)
    }
  })

  it('interpola {vars} y no deja placeholders colgados', () => {
    const texto = traducir('es', 'pub.ultimos', { n: 3 })
    assert.equal(texto, 'Últimos 3 lugares')
    assert.ok(!texto.includes('{n}'))
    assert.equal(traducir('en', 'pub.ultimos', { n: 3 }), 'Last 3 spots')
  })
})
