import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard de autorización en las llamadas del frontend.
 *
 * El bug: `PanelRegistros.tsx` llamaba a `/api/registros` con `fetch` a pelo,
 * sin `Authorization`. El backend exige Bearer desde que se eliminó el
 * fallback `x-user-uid`, así que las cinco llamadas de esa pantalla
 * (listar, exportar, reenviar, recontar) devolvían 401. El panel de
 * registros entero estaba roto y el error no señalaba la causa.
 *
 * Es fácil que vuelva a pasar porque el service `src/services/registros.ts`
 * SÍ manda el token: los dos caminos conviven y sólo uno anda. Por eso el
 * test no mira el service (que ya está bien) sino las páginas, que es
 * donde se coló.
 *
 * Cuando un endpoint exija sesión, la página tiene que pasar por el service
 * (`cabecerasAuth`) y no armar el `fetch` a mano.
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

/** Endpoints que el backend autentica con `verifyIdToken`. */
const ENDPOINTS_PROTEGIDOS = [
  '/api/registros',
  '/api/operador/link',
  '/api/admin-organizadores',
  '/api/me',
]

describe('autorización en el frontend', () => {
  const archivos = tsx(RAIZ)

  for (const ruta of archivos) {
    const nombre = ruta.slice(process.cwd().length + 1)
    // El service es el que debe poner el token; las páginas no deberían
    // armar estos fetches, pero si lo hacen tiene que ser con el token.
    if (nombre.endsWith('src/services/registros.ts')) continue
    if (nombre.endsWith('src/services/admin.ts')) continue

    const fuente = readFileSync(ruta, 'utf8')

    for (const endpoint of ENDPOINTS_PROTEGIDOS) {
      if (!fuente.includes(endpoint)) continue

      const usaFetchCrudo = new RegExp(`fetch\\(\\s*[\`'"]${endpoint}`).test(fuente)
      if (!usaFetchCrudo) continue

      it(`${nombre}: el fetch a ${endpoint} lleva Authorization`, () => {
        const idx = fuente.indexOf(endpoint)
        const ventana = fuente.slice(Math.max(0, idx - 400), idx + 700)
        assert.ok(
          /Authorization/.test(ventana),
          `${nombre} llama a ${endpoint} con fetch sin Authorization cerca del call: ` +
            'el backend responde 401. Usá el service, que ya pone el token.',
        )
      })
    }
  }
})

describe('URLs del backend', () => {
  it('los services usan rutas relativas, no un dominio hardcodeado', () => {
    // Con `VITE_APP_URL` sin definir (que es el caso en local) el fallback
    // mandaba el frontend de desarrollo contra la API de producción.
    for (const ruta of tsx(join(RAIZ, 'services'))) {
      const fuente = readFileSync(ruta, 'utf8')
      const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
      assert.ok(
        !/easyeventqr\.vercel\.app/.test(codigo),
        `${ruta.slice(process.cwd().length + 1)} tiene el dominio de producción hardcodeado en el código`,
      )
    }
  })
})
