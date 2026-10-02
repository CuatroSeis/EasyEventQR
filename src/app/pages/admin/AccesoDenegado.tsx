import { salir } from '../../../services/auth'

/**
 * Pantalla de "no sos super-admin", en vez de expulsar en silencio.
 *
 * Antes, `AdminPanel` hacía `return null` y un `navigate('/panel')` cuando
 * `/api/me` contestaba `isAdmin: false`. El usuario veía el panel un
 * instante y volvía atrás, sin una palabra. Lo más frustrante de un bug de
 * permisos es justamente que no dice *qué* permiso falta: "no tengo
 * permisos para editar eventos" no te dice si tenés que reactivar la cuenta,
 * cambiar el plan, cargar el saldo o iniciar sesión con otra cuenta.
 *
 * Acá cada motivo tiene su texto y, sobre todo, su salida. El caso real que
 * trajo este proyecto: un super-admin al que le pusieron el claim `admin: true`
 * seguía siendo expulsado porque `/api/me` miraba sólo la variable de
 * entorno y no el claim. Con el mensaje, la diferencia entre "mi claim no
 * llegó", "falta la variable de entorno" y "no tenés claim" queda a la vista
 * sin tener que abrir las herramientas de red.
 */
const MOTIVOS: Record<string, { titulo: string; cuerpo: string; pasos: string[] }> = {
  'falta-var': {
    titulo: 'El servidor no tiene configurado quién es super-admin',
    cuerpo:
      'La variable SUPER_ADMIN_UID no está puesta en este entorno. Con esa variable ausente, el único camino es el custom claim admin.',
    pasos: [
      'Poné SUPER_ADMIN_UID con tu UID en Vercel → Settings → Environment Variables.',
      'OJO: marcá los tres ambientes (Production, Preview, Development).',
      'Volvé a desplegar: la variable se lee en runtime, no al compilar.',
    ],
  },
  'sin-claim': {
    titulo: 'Tu cuenta todavía no es super-admin',
    cuerpo:
      'El servidor está configurado, pero tu UID no es el del super-admin y tu documento no tiene el custom claim admin.',
    pasos: [
      'Si sos vos quien administra esto: pedile a un super-admin que te lo asigne.',
      'El claim va en el documento de Firebase Authentication, no en el de Firestore.',
      'Después de asignarlo tenés que cerrar sesión y volver a entrar (ver abajo).',
    ],
  },
  'error-red': {
    titulo: 'No se pudo verificar tu sesión',
    cuerpo:
      'La consulta a /api/me falló o no devolvió una respuesta válida. Puede ser la red, o que las funciones del backend estén caídas.',
    pasos: [
      'Probá de nuevo en unos segundos.',
      'Si sigue, mirá los logs de Vercel para ver si /api/me está fallando.',
      'Verificá que FIREBASE_SERVICE_ACCOUNT esté bien puesta: sin eso, /api/me no puede verificar el token.',
    ],
  },
  desconocido: {
    titulo: 'Tu sesión no tiene permisos de super-admin',
    cuerpo: 'La respuesta del servidor no indica un motivo concreto.',
    pasos: ['Cerrá sesión y volvé a entrar con la cuenta correcta.'],
  },
  'sin-sesion': {
    titulo: 'No hay sesión activa',
    cuerpo: 'Este panel necesita que inicies sesión con la cuenta de super-admin.',
    pasos: ['Iniciá sesión y volvé a abrir esta pantalla.'],
  },
}

export default function AccesoDenegado({
  motivo,
  onSalir,
}: {
  motivo: string | null
  onSalir: () => void
}) {
  const info = MOTIVOS[motivo ?? ''] ?? MOTIVOS['desconocido']

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-borde bg-superficie p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            🔒
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-texto">{info.titulo}</h1>
            <p className="mt-1 text-sm text-texto-suave">{info.cuerpo}</p>
          </div>
        </div>

        <ol className="mt-4 space-y-2">
          {info.pasos.map((paso) => (
            <li key={paso} className="flex gap-2 text-sm text-texto">
              <span aria-hidden="true" className="text-texto-suave">
                →
              </span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-xl bg-superficie-2 p-3">
          <p className="text-sm font-semibold text-texto">¿Cambiaste un permiso recién?</p>
          <p className="mt-1 text-sm text-texto-suave">
            Los custom claims van horneados en el token que emite Firebase, y ese token se cachea
            una hora. Recargar la página no alcanza: cerrá sesión y volvé a entrar para que se
            emita uno nuevo con el claim.
          </p>
          <button
            type="button"
            onClick={() => void salir()}
            className="mt-3 min-h-[var(--touch-min)] w-full rounded-xl bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario"
          >
            Cerrar sesión y entrar de nuevo
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onSalir}
            className="min-h-[var(--touch-min)] flex-1 rounded-xl border border-borde px-4 py-2 text-sm font-medium text-texto"
          >
            Volver al panel
          </button>
        </div>
      </div>
    </main>
  )
}