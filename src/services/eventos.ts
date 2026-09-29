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
import type { EstadoEvento, Evento } from '../shared/types'

/**
 * CRUD de eventos desde el navegador.
 *
 * No hay backend acá, y no es un atajo: las reglas de /eventos ya
 * autorizan al dueño a crear, leer, editar y borrar lo suyo, y nada de lo
 * que hace esta fase necesita la credencial del Admin SDK. La Fase 3
 * sí lo va a necesitar, para el alta de registros, que es donde aparece
 * el QR y el mail.
 *
 * La función que CONSTRUYE el documento vive en documentoEvento.ts, sin
 * el SDK, para que los tests puedan importarla. Acá sólo se habla con
 * Firestore.
 */

/**
 * Normaliza lo que devuelve Firestore a un Date de verdad.
 *
 * La interfaz `Evento` dice `fecha: Date`, y al escribir eso es cierto:
 * el SDK web convierte un `Date` a `Timestamp`. Pero al LEER, Firestore
 * devuelve un `Timestamp`, no un `Date`. O sea que sin este paso el tipo
 * declarado sería una mentira y `evento.fecha.toLocaleDateString()`
 * reventaría en runtime con "toLocaleDateString is not a function".
 *
 * Por eso normalizamos acá y no en cada componente: el que consume
 * `listarEventos` recibe Dates de verdad y no tiene que defenderse.
 */
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
    // `?? 0` y no un Number() sobre undefined: un evento creado antes de
    // la Fase 3 no tiene el campo, y `Number(undefined)` es NaN, que
    // comparado con cualquier capacidad da NaN y "quedan N lugares" en
    // pantalla. Un 0 es la lectura honesta de "todavía no reservó nadie".
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
      ...(typeof datos.personalizacion === 'object' && datos.personalizacion !== null
        ? datos.personalizacion
        : {}),
    },
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
 */
export async function crearEvento(organizadorId: string, borrador: BorradorEvento): Promise<string> {
  const referencia = await addDoc(
    collection(db, 'eventos'),
    nuevoDocumentoEvento(organizadorId, borrador) satisfies Evento,
  )
  return referencia.id
}

/**
 * Edita un evento.
 *
 * Se manda un objeto con los campos a cambiar, NO el evento entero. Es
 * la diferencia entre un update parcial y un overwrite: mandar el
 * documento completo con `setDoc` sobreescribiría `organizadorId` con lo
 * que viniera en el objeto, y las reglas lo rechazarían con
 * `noCambiaDueno()`.
 *
 * Se ignora cualquier `organizadorId` que venga por error en `cambios`:
 * el dueño de un evento no se cambia, y la regla lo bloquea igual, pero
 * es mejor no mandarlo.
 */
export async function actualizarEvento(eventoId: string, cambios: CambiosEvento): Promise<void> {
  const limpio: Record<string, unknown> = {}

  if (typeof cambios.nombre === 'string') limpio.nombre = cambios.nombre.trim()
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

  if (Object.keys(limpio).length === 0) return

  await updateDoc(doc(db, 'eventos', eventoId), limpio)
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
export async function cambiarEstadoEvento(eventoId: string, estado: EstadoEvento): Promise<void> {
  await updateDoc(doc(db, 'eventos', eventoId), { estado })
}

export async function eliminarEvento(eventoId: string): Promise<void> {
  await deleteDoc(doc(db, 'eventos', eventoId))
}
