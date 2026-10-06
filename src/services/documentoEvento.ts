// Extensión explícita: los tests de reglas resuelven en modo "nodenext".
import type { Evento, PersonalizacionEvento } from '../shared/types.ts'
import { esTemaPreset } from '../shared/theming.ts'
import { generarCodigoCorto, generarSlug, normalizarTexto } from '../shared/utils.ts'

/**
 * La forma del formulario, y el único lugar donde nace un evento.
 *
 * Misma razón que en organizadores.ts: este archivo no importa el SDK de
 * Firebase, así que los tests de reglas pueden importar la función REAL
 * que construye el documento y mandarla escribir contra las reglas del
 * emulador. tests/rules/ayudas.ts la usa en `datosEvento`, igual que usa
 * `nuevoDocumentoOrganizador` para las cuentas. Sin eso habría dos
 * copias de la forma del evento que quedan viejo en silencio.
 */

/** Lo que el organizador llena en el formulario. */
export interface BorradorEvento {
  nombre: string
  fecha: Date
  lugar: string
  descripcion: string
  capacidadMaxima: number
  requierePago: boolean
  precioEntrada: number | null
  bannerUrl: string | null
  visibilidad: 'publico' | 'privado'
  tema?: import('../shared/types.ts').TemaPreset | null
}

/**
 * Personalización vacía.
 *
 * En la Fase 2 el evento no tiene branding propio todavía: la Fase 3 lo
 * abre junto con la landing pública. Se nace con los null para que el
 * documento tenga la forma final desde el día uno, en vez de aparecer
 * campos nuevos más adelante y tener que distinguir "no personalizado"
 * de "el campo no existe".
 *
 * Copia profunda a propósito: si dos eventos compartieran el mismo objeto
 * `personalizacion`, tematizar uno con `aplicarTema` en runtime le
 * cambiaría el color al otro sin que nadie lo pidiera.
 */
function personalizacionVacia(): PersonalizacionEvento {
  return {
    bannerUrl: null,
    logoUrl: null,
    colorPrimario: null,
    colorSecundario: null,
    textoBienvenida: null,
    textoConfirmacion: null,
    tema: null,
  }
}

/**
 * Construye el documento del evento.
 *
 * `estado` nace SIEMPRE en 'activo' y no es un parámetro, a propósito: la
 * regla del create exige `request.resource.data.estado == 'activo'`, así
 * que un evento que nace cerrado es un alta que las reglas rechazan sin
 * motivo legible. Cerrar un evento es una operación posterior y
 * explícita (`cambiarEstadoEvento`).
 *
 * `organizadorId` viene del uid de la sesión y no del formulario. No por
 * comodidad: es la única forma de que un cliente modificado no pueda
 * crear un evento a nombre de otro. Las reglas lo vuelven a verificar
 * (`loCreoComoMio()`), porque la UI no es la seguridad.
 *
 * `reservas` nace en 0 y NO es un parámetro del formulario, por la misma
 * razón que `estado`: la regla del create exige que venga en 0, así que un
 * evento que nace "con 50 reservas" es un alta que las reglas rechazan. Es
 * el servidor, con el Admin SDK y adentro de una transacción, el único
 * que lo incrementa.
 */
export function nuevoDocumentoEvento(organizadorId: string, borrador: BorradorEvento): Evento {
  const nombre = limpiarTexto(borrador.nombre)
  return {
    organizadorId,
    nombre,
    fecha: borrador.fecha,
    lugar: limpiarTexto(borrador.lugar),
    descripcion: limpiarTexto(borrador.descripcion),
    capacidadMaxima: borrador.capacidadMaxima,
    reservas: 0,
    estado: 'activo',
    requierePago: borrador.requierePago,
    precioEntrada: borrador.requierePago ? borrador.precioEntrada : null,
    personalizacion: {
      ...personalizacionVacia(),
      bannerUrl: borrador.bannerUrl?.trim() || null,
      // Sólo llaves conocidas (un `tema` inventado cae a null).
      tema: esTemaPreset(borrador.tema ?? null) ? borrador.tema as import('../shared/types.ts').TemaPreset : null,
    },
    // La unicidad real la garantiza el backend en transacción.
    codigoCorto: generarCodigoCorto(),
    nombreNormalizado: normalizarTexto(nombre),
    slug: generarSlug(nombre),
    visibilidad: borrador.visibilidad,
  }
}

export interface ProblemaDeValidacion {
  campo: keyof BorradorEvento
  mensaje: string
}

/**
 * Valida el borrador contra el límite del plan, en el navegador.
 *
 * Esto NO es seguridad: es para poder decirle al organizador "te pasás por
 * 1" antes de que lo rechace el servidor. La regla de `capacidadDentroDelPlan`
 * es la que manda, y el test de límites comprueba que también.
 *
 * El límite llega por parámetro en vez de leerse del documento del
 * organizador acá, para que esta función siga siendo pura y testeable.
 */
/**
 * Tope de longitud y caracteres de control en un texto libre del evento.
 *
 * Dos motivos, y el segundo es el que importa:
 *
 * 1. Un `nombre` de 50.000 caracteres se guarda, se manda por mail y
 *    aparece en el asunto y en la landing. No es una vulnerabilidad, es
 *    basura que después nadie sabe cómo limpiar.
 *
 * 2. El `nombre` va CRUDO al `subject` del mail (el HTML sí escapa, el
 *    asunto no). Con un `\r\n` en el medio, un organizador puede meter
 *    cabeceras propias en un mail que se envía a un tercero. Que Brevo
 *    sanee el subject o no depende de la versión, y no voy a betting
 *    contra eso: el dato se filtra en la frontera.
 *
 * Se rechazan los controles ASCII (0x00-0x1F y 0x7F). El tab, el salto de
 * línea y el carriage return se permiten y se normalizan a espacio: un
 * nombre con dos renglones es legítimo, uno con un salto de línea en medio
 * del asunto no.
 */
// `no-control-regex` salta porque estas expresiones *buscan* caracteres de
// control a propósito: es la regla la que las necesita para poder filtrar
// un nombre con un `\u0000` pegado. Sacar el aviso no cambia el código.
// eslint-disable-next-line no-control-regex
const CONTROL_NO_IMPRIMIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
// eslint-disable-next-line no-control-regex
const CONTROL_NO_IMPRIMIBLE_G = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const ESPACIO_EN_BLANCO = /[\t\r\n]+/g

function revisarTexto(
  campo: keyof BorradorEvento,
  valor: string,
  maximo: number,
): ProblemaDeValidacion[] {
  const problemas: ProblemaDeValidacion[] = []
  const limpio = limpiarTexto(valor)

  if (limpio.length > maximo) {
    problemas.push({ campo, mensaje: `Este campo admite hasta ${maximo} caracteres (van ${limpio.length}).` })
  }

  if (CONTROL_NO_IMPRIMIBLE.test(valor)) {
    problemas.push({ campo, mensaje: 'Este campo tiene caracteres que no se pueden mostrar.' })
  }

  return problemas
}

/**
 * Deja el texto listo para persistir: sin tabs ni saltos de línea y sin
 * caracteres de control.
 *
 * Validar sin normalizar no alcanza. `revisarTexto` acepta un nombre con
 * dos renglones porque es legítimo, y `nuevoDocumentoEvento` tiene que
 * guardarlo de forma que el `subject` del mail no reciba el `\r\n` crudo.
 * Si sólo validáramos, el dato sucio igual llegaría al mail.
 */
function limpiarTexto(valor: string): string {
  return valor.replace(CONTROL_NO_IMPRIMIBLE_G, '').replace(ESPACIO_EN_BLANCO, ' ').trim()
}

export function validarBorrador(
  borrador: BorradorEvento,
  capacidadMaximaPermitida: number,
): ProblemaDeValidacion[] {
  const problemas: ProblemaDeValidacion[] = []

  if (!borrador.nombre.trim()) {
    problemas.push({ campo: 'nombre', mensaje: 'Poné un nombre para el evento.' })
  } else {
    problemas.push(...revisarTexto('nombre', borrador.nombre, 80))
  }

  if (borrador.lugar.trim()) {
    problemas.push(...revisarTexto('lugar', borrador.lugar, 120))
  }

  if (borrador.descripcion.trim()) {
    problemas.push(...revisarTexto('descripcion', borrador.descripcion, 1000))
  }

  if (Number.isNaN(borrador.fecha.getTime())) {
    problemas.push({ campo: 'fecha', mensaje: 'La fecha no es válida.' })
  }

  if (!borrador.lugar.trim()) {
    problemas.push({ campo: 'lugar', mensaje: 'Indicá dónde se hace.' })
  }

  const capacidad = borrador.capacidadMaxima
  if (!Number.isInteger(capacidad) || capacidad < 1) {
    problemas.push({ campo: 'capacidadMaxima', mensaje: 'La capacidad tiene que ser un número entero de 1 o más.' })
  } else if (capacidad > capacidadMaximaPermitida) {
    problemas.push({
      campo: 'capacidadMaxima',
      mensaje: `Tu plan permite hasta ${capacidadMaximaPermitida} entradas por evento.`,
    })
  }

  if (borrador.requierePago) {
    const precio = borrador.precioEntrada
    if (precio === null || !Number.isFinite(precio) || precio <= 0) {
      problemas.push({ campo: 'precioEntrada', mensaje: 'Si el evento es pago, el precio tiene que ser mayor a 0.' })
    }
  }

  if (borrador.tema !== null && borrador.tema !== undefined && !esTemaPreset(borrador.tema)) {
    problemas.push({ campo: 'tema', mensaje: 'Ese estilo no existe.' })
  }

  if (borrador.bannerUrl && borrador.bannerUrl.trim()) {
    const url = borrador.bannerUrl.trim()
    try {
      new URL(url)
      if (!['http:', 'https:'].includes(new URL(url).protocol)) {
        problemas.push({ campo: 'bannerUrl', mensaje: 'La URL del banner debe ser http o https.' })
      }
    } catch {
      problemas.push({ campo: 'bannerUrl', mensaje: 'La URL del banner no es válida.' })
    }
  }

  return problemas
}
