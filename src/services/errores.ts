import type { Organizador } from '../shared/types.ts'

/**
 * Traducción de errores de Firestore a mensajes que se puedan actuar.
 *
 * Existe porque cada servicio tenía su propia versión (o ninguna):
 * `branding.ts` tenía un `explicarError` local que ante CUALQUIER
 * `permission-denied` decía "tu plan no permite eso", y `eventos.ts` no
 * traducía nada, así que el organizador veía el texto crudo de Firebase.
 *
 * El problema de fondo no es la redacción: es que `permission-denied` es un
 * mismo código para causas muy distintas, y el mensaje tendría que saber
 * cuál de ellas es. Por eso el traductor recibe el estado conocido de la
 * cuenta en vez de adivinar:
 *
 *   - la cuenta está suspendida  -> no es el plan, es la suscripción
 *   - el documento no existe     -> no es el plan, es que la cuenta no se
 *                                   terminó de crear
 *   - el plan no alcanza         -> sí es el plan, y se dice el número
 *
 * Adivinar "es el plan" cuando en realidad es una suspensión manda al
 * usuario a cambiar el plan, que no arregla nada, y lo manda con confianza.
 *
 * `permission-denied` en Firestore NO dice qué regla falló, y no hay forma
 * de averiguarlo desde el cliente. La estrategia es la inversa: se listan las
 * causas que la app conoce y se muestra la que aplica.
 */

/** La pantalla puede ofrecer una salida (reactivar, cambiar plan). */
export type CausaDePermiso = 'suspendido' | 'sin-documento' | 'plan' | 'desconocido'

export interface DetalleDeLimite {
  limite?: number
  pedido?: number
}

/**
 * `permission-denied` con la causa ya atribuida.
 *
 * Se hace con una subclase y no con una propiedad en `Error` porque el
 * tsconfig tiene `erasableSyntaxOnly`: eso prohibe los parámetros de
 * propiedad en el constructor (`readonly x` en los argumentos), que es
 * justamente la sintaxis más cómoda para esto. La clase existe para poder
 * hacer `instanceof` en la UI y cambiar el comportamiento según la causa,
 * no para mantener estado: el estado va en el mensaje.
 */
export class ErrorDePermiso extends Error {
  readonly causa: CausaDePermiso
  readonly detalle?: DetalleDeLimite

  constructor(mensaje: string, causa: CausaDePermiso, detalle?: DetalleDeLimite) {
    super(mensaje)
    this.name = 'ErrorDePermiso'
    this.causa = causa
    this.detalle = detalle
  }
}

function codigoDe(error: unknown): string {
  const crudo = error as { code?: unknown } | null
  return typeof crudo?.code === 'string' ? crudo.code : ''
}

/**
 * Explica un error de escritura a la luz del estado de la cuenta.
 *
 * `organizador` puede ser `null` cuando todavía no se pudo leer el
 * documento: en ese caso sólo se descartan las causas que sabemos que no
 * son, y el resto queda como desconocido en vez de inventar un motivo.
 */
export function explicarErrorFirestore(
  error: unknown,
  organizador: Organizador | null,
  contexto?: { limite?: number; pedido?: number },
): Error {
  const codigo = codigoDe(error)

  if (codigo === 'unavailable' || codigo === 'deadline-exceeded') {
    return new Error('No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.')
  }

  if (codigo !== 'permission-denied') {
    // `unavailable` ya está cubierto; el resto son errores que no
    // controlamos (cuota, formato, red). El mensaje genérico es honesto.
    return new Error(
      'No se pudo guardar el cambio. Si sigue pasando, revisá la consola del navegador para ver el detalle técnico.',
    )
  }

  // De acá para adelante es `permission-denied`. La regla que falló no se
  // puede saber, así que se descartan las causas conocidas.

  if (organizador?.estadoSuscripcion === 'suspendido') {
    return new ErrorDePermiso(
      'Tu cuenta está suspendida, así que no podés modificar nada hasta reactivarla. Pedile a un administrador que la reactive.',
      'suspendido',
    )
  }

  if (!organizador) {
    return new ErrorDePermiso(
      'No pudimos leer los datos de tu cuenta, así que no podemos confirmar que tengas permiso. Recargá la página: si sigue igual, es probable que tu cuenta no se haya terminado de crear.',
      'sin-documento',
    )
  }

  // Si el pedido excede un límite que la app ya conoce, ese es el motivo y
  // se dice con números en vez de "tu plan no permite".
  if (contexto?.limite !== undefined && (contexto.pedido ?? 0) > contexto.limite) {
    return new ErrorDePermiso(
      `Tu plan permite hasta ${contexto.limite} y estás pidiendo ${contexto.pedido}. Bajá la cantidad o pedí un plan con más cupo.`,
      'plan',
      { limite: contexto.limite, pedido: contexto.pedido },
    )
  }

  return new ErrorDePermiso(
    'No tenés permiso para este cambio. Si creés que es un error, revisá el plan de tu cuenta en la sección de administración.',
    'desconocido',
  )
}