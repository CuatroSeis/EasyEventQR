import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tests estáticos del Formulario progresivo de EventoPublico.
 *
 * El repo corre `node --test` sin DOM ni React Testing Library, así que
 * estos tests verifican la estructura del componente en el archivo fuente
 * (igual que `tests/unit/formularios.test.ts`).
 */

const FUENTE = readFileSync(join(process.cwd(), 'src/app/pages/EventoPublico.tsx'), 'utf8')

describe('Formulario progresivo de EventoPublico (2 pasos)', () => {
  it('tiene un estado de paso de 2 valores inicializado en "1"', () => {
    assert.ok(FUENTE.includes("const [paso, setPaso] = useState<'1' | '2'>('1')"))
  })

  it('declara el estado de paso antes del anticipo de agotado (reglas de hooks)', () => {
    const agotado = FUENTE.indexOf('if (evento.agotado) return null')
    const paso = FUENTE.indexOf('const [paso, setPaso]')
    assert.ok(agotado !== -1, 'falta el anticipo de agotado')
    assert.ok(paso !== -1, 'falta el estado de paso')
    assert.ok(paso < agotado, 'los useState deben ir antes del return anticipado (reglas de hooks)')
  })

  it('el paso 1 renderiza los 5 campos en orden (nombre, email, telefono, dni, fechaNacimiento)', () => {
    const campos = ['nombre', 'email', 'telefono', 'dni', 'fechaNacimiento']
    let ultimo = -1
    for (const campo of campos) {
      const idx = FUENTE.indexOf(`name="${campo}"`)
      assert.ok(idx !== -1, `falta el input name="${campo}"`)
      assert.ok(idx > ultimo, `el campo ${campo} debe ir después del anterior`)
      ultimo = idx
    }
  })

  it('mantiene la trampa sitioWeb oculta siempre en el DOM (sr-only + aria-hidden)', () => {
    assert.ok(FUENTE.includes('className="sr-only"'))
    assert.ok(FUENTE.includes('aria-hidden="true"'))
    assert.ok(FUENTE.includes('name="sitioWeb"'))
  })

  it('no agrega literales de copy nuevos: usa claves i18n existentes', () => {
    assert.ok(FUENTE.includes("t('comun.siguiente')"), 'falta el botón Siguiente')
    assert.ok(FUENTE.includes("t('comun.volver')"), 'falta el botón Atrás')
    assert.ok(FUENTE.includes("t('pub.form.enviar')"), 'falta el botón Reservar mi lugar')
    assert.ok(FUENTE.includes("t('pub.form.aviso')"), 'falta el aviso')
  })

  it('valida el paso 1 antes de avanzar y guarda problemas por campo', () => {
    assert.ok(FUENTE.includes('setPaso(\'2\')'), 'falta el avance al paso 2')
    assert.ok(FUENTE.includes('El nombre debe tener al menos 2 caracteres.'))
    assert.ok(FUENTE.includes('El email es requerido.'))
    assert.ok(FUENTE.includes('El DNI debe tener 7 u 8 dígitos.'))
    assert.ok(FUENTE.includes('La fecha de nacimiento es requerida.'))
    assert.ok(
      FUENTE.includes("siguiente.nombre =") ||
        FUENTE.includes("siguiente.email =") ||
        FUENTE.includes("siguiente.dni =") ||
        FUENTE.includes("siguiente.fechaNacimiento ="),
      'falta el guardado de problemas por campo',
    )
  })

  it('el paso 2 muestra resumen de los 5 campos, precio si corresponde, y los botones Atrás / Reservar', () => {
    assert.ok(FUENTE.includes('setPaso(\'1\')'), 'falta el botón Atrás')
    assert.ok(FUENTE.includes('valores[campo]'), 'falta el resumen de valores del paso 2')
    assert.ok(FUENTE.includes('pub.form.pago'), 'falta el precio del paso 2')
  })

  it('mantiene <form onSubmit={mandar}> con preventDefault y envía sitioWeb vacío', () => {
    assert.ok(FUENTE.includes('<form onSubmit={mandar}'), 'falta el form con preventDefault obligatorio')
    assert.ok(FUENTE.includes('e.preventDefault()'), 'mandar no llama a preventDefault()')
    assert.ok(FUENTE.includes("form.get('sitioWeb')"), 'falta sitioWeb en el envío')
  })
})
