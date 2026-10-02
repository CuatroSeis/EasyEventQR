import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard de las rutas del super-admin.
 *
 * El bug: `/admin` estaba anidada dentro de `<Route element={<Protegido />}>`.
 * `Protegido` exige que el organizador esté activo, así que al añadirle
 * una pantalla de "tu cuenta está suspendida" se creó una jaula: el
 * super-admin suspendido ve "pedí que te reactiven" y no tiene cómo
 * pedirlo, porque el panel donde se reactiva está detrás del mismo candado.
 *
 * No se puede cazar con un test de render porque el bug es de ARBOL de
 * rutas, no de comportamiento de un componente. Lo que sí es verificable
 * sin browser es la propiedad estructural: `/admin` no debe declararse
 * dentro del bloque de `<Protegido>`.
 */

const app = readFileSync(join(process.cwd(), 'src/app/App.tsx'), 'utf8')

/**
 * Devuelve el bloque `<Route element={<Protegido />}>` con sus hijos.
 *
 * Dos trampas que hacen que un conteo ingenuo devuelva basura:
 *
 * 1. No se puede cortar en el primer `/>`: la apertura es
 *    `<Route element={<Protegido />}>`, así que ese `/>` es del
 *    componente y el bloque sale VACÍO. Con un bloque vacío, el test de
 *    `/admin` "pasa" sin mirar nada.
 * 2. Contar `<Route` contra `</Route>` tampoco sirve: los hijos son
 *    `<Route path="..." element={...} />`, auto-cerrados, así que suben la
 *    profundidad y nunca la bajan. Hay que distinguir apertura de
 *    auto-cierre.
 *
 * Por eso el escaneo es consciente de llaves: el `>` que cierra la
 * etiqueta no cuenta si está dentro de `{...}` (como el `{<Protegido />}`
 * de la apertura), y un Route se toma auto-cerrado sólo si, terminado
 * el tag, el último carácter antes del `>` es `/`.
 */
function bloqueProtegido(fuente: string): string {
  const APERTURA = '<Route element={<Protegido />}>'
  const inicio = fuente.indexOf(APERTURA)
  assert.ok(inicio !== -1, `no se encontró \`${APERTURA}\` en App.tsx`)

  let pos = inicio
  let profundidad = 0

  while (pos < fuente.length) {
    if (fuente.startsWith('</Route>', pos)) {
      pos += '</Route>'.length
      profundidad -= 1
      if (profundidad === 0) return fuente.slice(inicio, pos)
      continue
    }

    if (fuente.startsWith('<Route', pos)) {
      // Recorre el tag contando llaves para no confundirse con el `>`
      // de un componente dentro de un prop.
      let i = pos + '<Route'.length
      let llaves = 0
      while (i < fuente.length) {
        const c = fuente[i]
        if (c === '{') llaves += 1
        else if (c === '}') llaves -= 1
        else if (c === '>' && llaves === 0) break
        i += 1
      }
      assert.ok(i < fuente.length, 'tag <Route> sin cerrar en App.tsx')

      const autoCerrado = fuente.slice(pos, i).trimEnd().endsWith('/')
      if (!autoCerrado) profundidad += 1

      pos = i + 1
      continue
    }

    pos += 1
  }

  throw new Error('no se pudo cerrar el bloque de <Protegido>')
}

describe('estructura de rutas', () => {
  it('/admin NO está dentro del gate de <Protegido>', () => {
    const bloque = bloqueProtegido(app)
    assert.ok(
      !bloque.includes('/admin'),
      '/admin quedó dentro de <Protegido>: una cuenta super-admin suspendida no podría entrar a reactivar cuentas, que es justo lo que el panel hace',
    )
  })

  it('el bloque extraído no está vacío (si el test pasa al vacío, no mira nada)', () => {
    // Guarda contra el modo de falla que acaban de suffersar: un parser
    // que devuelve "" hace que "no contiene /admin" sea cierto por culpa
    // del parser y no de la app.
    const bloque = bloqueProtegido(app)
    assert.ok(bloque.includes('<PanelLayout />'), 'el bloque de <Protegido> debería contener PanelLayout')
    assert.ok(bloque.length > 100, `bloque sospechosamente corto: ${bloque.length} caracteres`)
  })

  it('/admin se declara fuera del bloque protegido', () => {
    assert.ok(app.includes('<Route path="/admin" element={<AdminPanel />} />'))
  })

  it('las rutas /panel siguen dentro de <Protegido>', () => {
    const bloque = bloqueProtegido(app)
    for (const ruta of [
      '/panel',
      '/panel/eventos/nuevo',
      '/panel/eventos/:eventoId',
      '/panel/eventos/:eventoId/registros',
      '/panel/branding',
    ]) {
      assert.ok(bloque.includes(`path="${ruta}"`), `${ruta} debería estar protegida por <Protegido>`)
    }
  })

  it('las rutas públicas NO exigen sesión', () => {
    const bloque = bloqueProtegido(app)
    for (const ruta of ['/e/:eventoId', '/q/:token', '/pago/simulado', '/operador/:token', '/entrar']) {
      assert.ok(!bloque.includes(`path="${ruta}"`), `${ruta} no debería estar dentro de <Protegido>`)
    }
  })
})
