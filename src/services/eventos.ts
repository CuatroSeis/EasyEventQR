import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'

import { db } from './firebase'
import { nuevoDocumentoEvento, type BorradorEvento } from './documentoEvento'
import { explicarErrorFirestore } from './errores'
import { normalizarTexto } from '../shared/utils'
import type { EstadoEvento, Evento, Organizador } from '../shared/types'

/** CRUD de eventos desde el navegador (las reglas ya autorizan al dueño; sin Admin SDK). */

/** Firestore devuelve `Timestamp` al leer aunque el tipo diga `Date`: se normaliza acá una vez. */
function aFecha(valor: unknown): Date | null {
  if (valor instanceof Date) return valor
  // `Timestamp` es la clase de Firestore; tiene toDate(). No se chequea
  // `instanceof Timestamp` porque el emulador puede devolver una versión
  // distinta de la clase que importa el type-checker (el mismo problema
  // que hay en las ayudas de los tests de reglas).
  if (valor && typeof valor === 'object' && 'toDate' in valor && typeof valor.toDate === 'function') {
    return (valor as Timestamp).toDate()
  }
  if (typeof valor === 'string') {
    const parseada = new Date(valor)
    return Number.isNaN(parseada.getTime()) ? null : parseada
  }
  return null
}

/** Los campos que el organizador puede cambiar de un evento. */
export type CambiosEvento = Partial<BorradorEvento>

/**
 * Un evento con su id.
 *
 * El id NO es un campo del documento: es la clave con la que Firestore lo
 * guarda. Por eso no está en la interfaz `Evento` de shared/types.ts —
 * `nuevoDocumentoEvento` no podría llenarlo, porque en el momento del
 * create todavía no existe— y por eso vive acá, en el service que es
 * donde se lee. La UI lo necesita para armar /panel/eventos/{id}.
 */
export type EventoConId = Evento & { id: string }

/**
 * Normaliza el documento de Firestore al tipo `Evento`.
 *
 * Los defaults son para que un documento creado antes de un campo nuevo
 * no rompa la pantalla con un undefined. Falta un campo, se usa el
 * default; no se lanza.
 */
function aEvento(id: string, datos: Record<string, unknown>): EventoConId {
  return {
    id,
    organizadorId: String(datos.organizadorId ?? ''),
    nombre: String(datos.nombre ?? ''),
    fecha: aFecha(datos.fecha) ?? new Date(0),
    lugar: String(datos.lugar ?? ''),
    descripcion: String(datos.descripcion ?? ''),
    capacidadMaxima: Number(datos.capacidadMaxima ?? 0),
    // `?? 0`: sin el campo (eventos viejos), NaN dejaría pasar a todos.
    reservas: Number(datos.reservas ?? 0),
    estado: datos.estado === 'cerrado' ? 'cerrado' : 'activo',
    requierePago: datos.requierePago === true,
    precioEntrada: typeof datos.precioEntrada === 'number' ? datos.precioEntrada : null,
    personalizacion: {
      bannerUrl: null,
      logoUrl: null,
      colorPrimario: null,
      colorSecundario: null,
      textoBienvenida: null,
      textoConfirmacion: null,
      tema: null,
      ...(typeof datos.personalizacion === 'object' && datos.personalizacion !== null
        ? datos.personalizacion
        : {}),
    },
    // Defaults para documentos viejos sin estos campos.
    codigoCorto: String(datos.codigoCorto ?? id),
    nombreNormalizado: String(datos.nombreNormalizado ?? ''),
    slug: String(datos.slug ?? ''),
    visibilidad: datos.visibilidad === 'publico' ? 'publico' : 'privado',
  }
}

/**
 * Los eventos del organizador, del más nuevo al más viejo.
 *
 * El `where` es OBLIGATORIO y no es una optimización: las reglas evalúan
 * un `list` documento por documento, así que un `getDocs(collection(...))`
 * sin filtro no devuelve error ni los eventos ajenos: no devuelve NADA, y
 * la pantalla queda vacía sin explicar por qué. Hay un test que fija
 * exactamente eso.
 *
 * El `orderBy('fecha')` combinado con el `where` sobre otro campo exige un
 * índice compuesto, que no lo crea Firestore solo. Está declarado en
 * firestore.indexes.json y desplegado; sin él, esta consulta falla con
 * FAILED_PRECONDITION.
 */
export async function listarEventos(organizadorId: string): Promise<EventoConId[]> {
  const referencia = query(
    collection(db, 'eventos'),
    where('organizadorId', '==', organizadorId),
    orderBy('fecha', 'desc'),
  )
  const instantanea = await getDocs(referencia)
  return instantanea.docs.map((documento) => aEvento(documento.id, documento.data()))
}

export async function obtenerEvento(eventoId: string): Promise<EventoConId | null> {
  const instantanea = await getDoc(doc(db, 'eventos', eventoId))
  if (!instantanea.exists()) return null
  return aEvento(instantanea.id, instantanea.data())
}

/**
 * Crea el evento y devuelve el id generado.
 *
 * `addDoc` y no `setDoc` con un id inventado: que el id lo genere
 * Firestore evita dos-organizadores-el-mismo-id y de paso nos da un id
 * opaco, que es lo que después viaja dentro del QR.
 *
 * `organizador` se pasa para poder explicar el error: sin él, un
 * `permission-denied` (cuota del plan, cuenta suspendida) llegaría al
 * formulario como el texto crudo de Firebase, que no dice nada.
 *
 * LEGACY: el camino vigente es `crearEventoBackend` (POST /api/eventos),
 * que genera el código corto en transacción. Esta función queda para
 * compatibilidad y tests.
 */
export async function crearEvento(
  organizadorId: string,
  borrador: BorradorEvento,
  organizador?: Organizador | null,
): Promise<string> {
  try {
    const referencia = await addDoc(
      collection(db, 'eventos'),
      nuevoDocumentoEvento(organizadorId, borrador) satisfies Evento,
    )
    return referencia.id
  } catch (error) {
    throw explicarErrorFirestore(error, organizador ?? null, {
      limite: organizador?.limitesPersonalizacion.capacidadMaximaPorEvento,
      pedido: borrador.capacidadMaxima,
    })
  }
}

/**
 * Crea el evento por el backend (POST /api/eventos): código y slug nacen
 * en transacción y el código es el id, así el link y el buscador no
 * necesitan fallback.
 */
export interface EventoCreado {
  codigoCorto: string
  slug: string
  eventoId: string
}

export async function crearEventoBackend(borrador: BorradorEvento): Promise<EventoCreado> {
  const { auth } = await import('./firebase')
  const usuario = auth.currentUser
  if (!usuario) {
    throw new Error('Tu sesión no está activa. Volvé a iniciar sesión.')
  }
  const resp = await fetch('/api/eventos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await usuario.getIdToken()}`,
    },
    body: JSON.stringify({
      nombre: borrador.nombre,
      fecha: borrador.fecha instanceof Date ? borrador.fecha.toISOString() : borrador.fecha,
      lugar: borrador.lugar,
      descripcion: borrador.descripcion,
      capacidadMaxima: borrador.capacidadMaxima,
      requierePago: borrador.requierePago,
      precioEntrada: borrador.precioEntrada,
      visibilidad: borrador.visibilidad,
      bannerUrl: borrador.bannerUrl,
      tema: borrador.tema,
    }),
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok || !data?.ok) {
    // El mensaje viene legible del backend (cupo del plan, cuenta
    // suspendida, fecha inválida): se muestra tal cual en vez de pasarlo
    // por explicarErrorFirestore, que lo taparía con un genérico.
    throw new Error(
      typeof data?.error === 'string' && data.error ? data.error : 'No se pudo crear el evento.',
    )
  }
  return { codigoCorto: data.codigoCorto, slug: data.slug, eventoId: data.eventoId }
}

/**
 * Duplica un evento: mismo contenido, identidad nueva.
 *
 * No se copia: reservas (0), estado (nace activo), código, slug ni
 * colores custom. Sí se copian banner y tema (identidad del evento).
 * Va por `crearEventoBackend` y no clonando el documento: el código corto
 * tiene que nacer en transacción o dos duplicados simultáneos colisionan.
 */
export async function duplicarEvento(evento: EventoConId): Promise<EventoCreado> {
  return crearEventoBackend({
    nombre: `${evento.nombre} (copia)`.slice(0, 80),
    fecha: evento.fecha,
    lugar: evento.lugar,
    descripcion: evento.descripcion,
    capacidadMaxima: evento.capacidadMaxima,
    requierePago: evento.requierePago,
    precioEntrada: evento.precioEntrada,
    bannerUrl: evento.personalizacion?.bannerUrl ?? null,
    visibilidad: evento.visibilidad,
    tema: evento.personalizacion?.tema ?? null,
  })
}

/**
 * Ventas pagadas de una lista de eventos.
 *
 * Una query simple por evento (sin índice compuesto) + filtro en memoria.
 * Tope de 500 pagadas por evento: si vende más, el número queda corto
 * (pendiente paginarlo).
 */
export async function resumenVentas(eventoIds: string[]): Promise<{ entradas: number; monto: number }> {
  const { obtenerRegistros } = await import('./registros')
  let entradas = 0
  let monto = 0
  await Promise.all(
    eventoIds.map(async (eventoId) => {
      const { registros } = await obtenerRegistros({ eventoId, pagoEstado: 'pagado', limite: 500 })
      entradas += registros.length
      for (const r of registros) {
        if (typeof r.pago.montoPagado === 'number') monto += r.pago.montoPagado
      }
    }),
  )
  return { entradas, monto }
}

/**
 * Edita un evento con update parcial (nunca `setDoc` completo: pisaría
 * `organizadorId` y la regla `noCambiaDueno()` lo rechazaría).
 */
export async function actualizarEvento(
  eventoId: string,
  cambios: CambiosEvento,
  organizador?: Organizador | null,
): Promise<void> {
  const limpio: Record<string, unknown> = {}

  if (typeof cambios.nombre === 'string') {
    limpio.nombre = cambios.nombre.trim()
    // El nombre normalizado viaja con el nombre: si no, la búsqueda por
    // nombre queda apuntando al nombre viejo y el evento "desaparece".
    limpio.nombreNormalizado = normalizarTexto(cambios.nombre.trim())
  }
  if (cambios.fecha instanceof Date) limpio.fecha = cambios.fecha
  if (typeof cambios.lugar === 'string') limpio.lugar = cambios.lugar.trim()
  if (typeof cambios.descripcion === 'string') limpio.descripcion = cambios.descripcion.trim()
  if (typeof cambios.capacidadMaxima === 'number') limpio.capacidadMaxima = cambios.capacidadMaxima
  if (typeof cambios.requierePago === 'boolean') limpio.requierePago = cambios.requierePago

  // El precio sólo tiene sentido si el evento es pago. Si mandan
  // requierePago:false y dejan el precio viejo, el documento quedaría
  // con requierePago:false y precio: 500, que es un evento gratis con
  // precio. Se manda null siempre que se apague el pago.
  if (cambios.requierePago === false) {
    limpio.precioEntrada = null
  } else if (typeof cambios.precioEntrada === 'number') {
    limpio.precioEntrada = cambios.precioEntrada
  }

  // bannerUrl y tema van dentro de personalizacion
  if (typeof cambios.bannerUrl === 'string') {
    limpio['personalizacion.bannerUrl'] = cambios.bannerUrl.trim() || null
  }
  if (cambios.tema === null || (typeof cambios.tema === 'string' && (cambios.tema === 'neon' || cambios.tema === 'corporativo' || cambios.tema === 'festival'))) {
    limpio['personalizacion.tema'] = cambios.tema
  }

  // La visibilidad es un dato operativo (como `estado`), no un dato del
  // formulario de contenido: se edita desde el mismo EventoForm pero viaja
  // como campo propio para que la regla no tenga que adivinarlo.
  if (cambios.visibilidad === 'publico' || cambios.visibilidad === 'privado') {
    limpio.visibilidad = cambios.visibilidad
  }

  if (Object.keys(limpio).length === 0) return

  try {
    await updateDoc(doc(db, 'eventos', eventoId), limpio)
  } catch (error) {
    // Mismo criterio que en `crearEvento`: el `permission-denied` de una
    // edición suele ser la capacidad del plan, y el número está a mano.
    throw explicarErrorFirestore(error, organizador ?? null, {
      limite: organizador?.limitesPersonalizacion.capacidadMaximaPorEvento,
      pedido: typeof cambios.capacidadMaxima === 'number' ? cambios.capacidadMaxima : undefined,
    })
  }
}

/**
 * Abre o cierra un evento. "Cerrado" es un evento que sigue visible pero
 * no acepta reservas nuevas: es como se corta la venta, y es reversible.
 *
 * Tiene su propia función y no es un campo del formulario a propósito.
 * Cerrar un evento es una decisión operativa, no un dato que se edita
 * junto con el lugar; mezclarlos en el mismo formulario es cómo un
 * evento se cierra sin querer.
 */
export async function cambiarEstadoEvento(
  eventoId: string,
  estado: EstadoEvento,
  organizador?: Organizador | null,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'eventos', eventoId), { estado })
  } catch (error) {
    throw explicarErrorFirestore(error, organizador ?? null)
  }
}

export async function eliminarEvento(eventoId: string, organizador?: Organizador | null): Promise<void> {
  try {
    await deleteDoc(doc(db, 'eventos', eventoId))
  } catch (error) {
    throw explicarErrorFirestore(error, organizador ?? null)
  }
}
