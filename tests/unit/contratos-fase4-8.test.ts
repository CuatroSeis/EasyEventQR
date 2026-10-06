import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contratos de la re-auditoría de Fases 4-8.
 *
 * Cada bug de acá ya existió y se arregló; el test está para que no
 * vuelva por otro camino. Son chequeos estáticos sobre el código, como
 * `auth-frontend.test.ts`: baratos y sin emulador.
 */

const RAIZ = join(process.cwd(), 'src')

function tsx(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...tsx(ruta))
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
}

describe('contratos fases 4-8', () => {
  it('ningún frontend usa VITE_APP_URL: las llamadas van relativas', () => {
    // PagoSimulado armaba `${VITE_APP_URL}/api/...`. En local esa variable
    // no existe (el .env define APP_URL sin prefijo VITE_) y el string vacío
    // zafaba de casualidad; definida, mandaba el checkout contra producción.
    for (const ruta of tsx(RAIZ)) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'))
      assert.ok(
        !codigo.includes('VITE_APP_URL'),
        `${ruta.slice(process.cwd().length + 1)} usa VITE_APP_URL: usar rutas relativas /api/...`,
      )
    }
  })

  it('verificarEstadoPago lee data.estado, la forma de /api/pagos/estado', () => {
    // El endpoint devuelve { ok, estado } plano. Leer data.registro dejaba
    // el estado en undefined y /pago/exito nunca llegaba a "aprobado".
    const fuente = sinComentarios(
      readFileSync(join(RAIZ, 'services', 'pagos.ts'), 'utf8'),
    )
    assert.ok(fuente.includes('data.estado'), 'verificarEstadoPago no lee data.estado')
    assert.ok(
      !fuente.includes('data.registro'),
      'verificarEstadoPago lee data.registro, que /api/pagos/estado no devuelve',
    )
  })

  it('ninguna página arma /q/ con un id de documento', () => {
    // El token en claro no se guarda: solo su SHA-256, que ES el id del
    // documento. Armar /q/<id> hashea el hash y nunca valida. El QR real
    // viaja solo por mail.
    // QrPublico dibuja el QR desde el token de la URL (/q/:token): esa
    // ES la fuente legítima, no un id de documento. Se excluye.
    for (const ruta of [...tsx(join(RAIZ, 'app')), ...tsx(join(RAIZ, 'widget'))]) {
      if (ruta.endsWith('src/app/pages/QrPublico.tsx')) continue
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'))
      assert.ok(
        !/\/q\/\$\{/.test(codigo),
        `${ruta.slice(process.cwd().length + 1)} arma /q/ con un id: el token no se puede rearmar desde el documento`,
      )
    }
  })

  it('el widget aplica el tema del evento y no toca el document', () => {
    // WidgetApp mostraba el formulario sin aplicar personalizacion y encima
    // escribía colorScheme en document.documentElement, filtrando estilos a
    // la página del tercero que lo embebe.
    const fuente = sinComentarios(
      readFileSync(join(RAIZ, 'widget', 'WidgetApp.tsx'), 'utf8'),
    )
    assert.ok(fuente.includes('aplicarTema('), 'el widget no aplica el tema del evento')
    assert.ok(
      !fuente.includes('document.documentElement'),
      'el widget escribe en el document del host: rompería el aislamiento del Shadow DOM',
    )
  })
})
