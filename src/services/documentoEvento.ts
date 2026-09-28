// El import lleva la extension explicita por el mismo motivo que en
// el resto de los services: los tests de reglas importan este modulo
// el type-stripping nativo de Node y resuelven en modo "nodenext", donde
// un import sin extensión no compila.
import type { Evento, PersonalizacionEvento } from '../shared/types.ts'

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
 */
export function nuevoDocumentoEvento(organizadorId: string, borrador: BorradorEvento): Evento {
  return {
    organizadorId,
    nombre: borrador.nombre.trim(),
    fecha: borrador.fecha,
    lugar: borrador.lugar.trim(),
    descripcion: borrador.descripcion.trim(),
    capacidadMaxima: borrador.capacidadMaxima,
    estado: 'activo',
    requierePago: borrador.requierePago,
    // Si no requiere pago, el precio se guarda en null y no en 0. La
    // diferencia importa al facturar: un evento gratis con precio 0 es
    // distinto de uno sin precio, y "0" se confunde con "el precio salió
    // mal" en cualquier reporte.
    precioEntrada: borrador.requierePago ? borrador.precioEntrada : null,
    personalizacion: personalizacionVacia(),
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
export function validarBorrador(
  borrador: BorradorEvento,
  capacidadMaximaPermitida: number,
): ProblemaDeValidacion[] {
  const problemas: ProblemaDeValidacion[] = []

  if (!borrador.nombre.trim()) {
    problemas.push({ campo: 'nombre', mensaje: 'Poné un nombre para el evento.' })
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

  return problemas
}
