import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Timestamp } from 'firebase-admin/firestore'

import { getDb } from '../src/server/lib/firebase-admin.js'
import type { Evento, Organizador } from '../src/shared/types.js'

/**
 * GET /api/evento-publico?id=... — los datos del evento para la landing.
 *
 * POR QUÉ EXISTE Y NO ES UN `getDoc` DESDE EL NAVEGADOR
 *
 * `firestore.rules` no deja leer /eventos sin sesión: el permiso es
 * `esSuperAdmin() || esMio()`. Es la decisión correcta, porque el mismo
 * documento tiene `organizadorId`, `reservas` y el precio de la entrada.
 *
 * La consecuencia es que alguien sin sesión no puede pintar la landing.
 * La salida es esta función, que lee con el Admin SDK (que se salta las
 * reglas) y devuelve SOLO una lista blanca de campos.
 *
 * Por eso este archivo es el más peligroso de la fase en un sentido
 * concreto: se salta las reglas, así que TODA la política de "qué puede
 * ver un desconocido" vive acá y no en `firestore.rules`. Si mañana se
 * agrega un campo a `Evento` y alguien pone `{...evento}` en el return,
 * se publica. Por eso no hay un `{...evento}` en ninguna línea de este
 * archivo, y la lista de lo que se devuelve es explícita.
 */

/** Un evento tal como lo ve alguien sin sesión. */
interface EventoPublico {
  eventoId: string
  nombre: string
  /** ISO 8601. El JSON de Firestore no sabe serializar un Timestamp. */
  fecha: string
  lugar: string
  descripcion: string
  /** Lo que queda, para el "últimas entradas" de la landing. */
  lugaresRestantes: number
  agotado: boolean
  requierePago: boolean
  precioEntrada: number | null
  personalizacion: {
    bannerUrl: string | null
    logoUrl: string | null
    colorPrimario: string | null
    colorSecundario: string | null
    textoBienvenida: string | null
    textoConfirmacion: string | null
  }
}

/**
 * Un mismo 404 para los tres casos.
 *
 * "No existe", "está cerrado" y "el organizador está suspendido" devuelven
 * lo mismo, con el mismo texto. Si el suspendido devolviera un 403 con un
 * mensaje propio, el endpoint estaría confirmando que ese evento existió y
 * que tiene dueño: cualquiera podría recorrer IDs y armar un mapa de qué
 * organizadores están suspendidos.
 */
function noEncontrado(res: VercelResponse) {
  return res.status(404).json({
    ok: false,
    error: 'Ese evento no existe o ya no está disponible.',
  })
}

/**
 * El `id` de la URL.
 *
 * Se valida con el mismo criterio que el registro: los IDs de Firestore
 * son [A-Za-z0-9_-]{1,1500}. Sin esto, un `id` con barra o punto hace que
 * el `doc()` de Firestore responda 500 en vez de un 400 con un mensaje que
 * un humano pueda entender.
 */
function leerEventoId(bruto: string | string[] | undefined): string | null {
  if (typeof bruto !== 'string') return null
  const id = bruto.trim()
  return /^[A-Za-z0-9_-]{1,1500}$/.test(id) ? id : null
}

/** Un Timestamp, un Date o un string ISO, siempre como ISO. */
function aIso(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString()
  const conToDate = valor as Timestamp | null | undefined
  if (conToDate && typeof conToDate.toDate === 'function') {
    return conToDate.toDate().toISOString()
  }
  const parseada = new Date(String(valor))
  return Number.isNaN(parseada.getTime()) ? '' : parseada.toISOString()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Cache-Control no-store: esta respuesta cambia seguido. El cupo
  // mientras se llena y el cierre de un evento desde el panel tienen que
  // verse al instante. Un CDN cacheando esto muestra "quedan 20 lugares"
  // en un evento lleno, y el caché es compartido entre visitantes, así
  // que además filtraría datos de un evento a otro.
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

  const eventoId = leerEventoId(req.query.id)
  if (!eventoId) return res.status(400).json({ ok: false, error: 'Falta el evento.' })

  try {
    const db = getDb()

    // 1. El caso común: el id de la URL es el id del documento (alta por
    // POST /api/eventos usa el código corto como id).
    let snapEvento = await db.collection('eventos').doc(eventoId).get()

    // 2. Fallbacks para eventos legacy o backfilleados, donde el código y
    // el slug viven en campos y el id es un auto-id. Sin esto, todo link
    // compartido de un evento viejo da "no existe".
    if (!snapEvento.exists) {
      const porCodigo = await db
        .collection('eventos')
        .where('codigoCorto', '==', eventoId.toUpperCase())
        .limit(1)
        .get()
      if (!porCodigo.empty) {
        snapEvento = porCodigo.docs[0]
      }
    }
    if (!snapEvento.exists) {
      const porSlug = await db.collection('eventos').where('slug', '==', eventoId).limit(1).get()
      if (!porSlug.empty) {
        snapEvento = porSlug.docs[0]
      }
    }
    if (!snapEvento.exists) return noEncontrado(res)

    const evento = snapEvento.data() as Evento
    if (evento.estado !== 'activo') return noEncontrado(res)

    // El `organizadorId` sale DEL documento, no de la URL: así no hay un
    // input del cliente que pueda apuntar a otro organizador. Y la
    // lectura es obligatoria: a un evento de un organizador suspendido no
    // se le puede registrar, así que tampoco se puede ver.
    const snapOrganizador = await db.collection('organizadores').doc(evento.organizadorId).get()
    if (!snapOrganizador.exists) return noEncontrado(res)

    const organizador = snapOrganizador.data() as Organizador
    if (organizador.estadoSuscripcion !== 'activo') return noEncontrado(res)

    // `reservas` es del organizador y no se publica. Lo que sí se publica
    // es la diferencia con la capacidad, que es lo único que necesita la
    // landing, con piso en cero para que un evento viejo que quedó por
    // sobre su capacidad no muestre números negativos.
    const reservas = Number(evento.reservas ?? 0)
    const lugaresRestantes = Math.max(0, evento.capacidadMaxima - reservas)

    const limites = organizador.limitesPersonalizacion
    const p = evento.personalizacion

    // La personalización se filtra por los límites del plan, aunque las
    // reglas ya los validen en el write. La diferencia es que las reglas
    // protegen la ESCRITURA: si un documento quedó con un banner de antes
    // de que el plan bajara de nivel, o si alguien lo escribió desde la
    // consola, la landing igual no lo muestra. El segundo piso, que son
    // cuatro ternarios, es el que hace que la restricción sea una regla y
    // no una sugerencia.
    // El `eventoId` que vuelve es el ID REAL del documento, no lo que
    // vino en la URL: el formulario lo manda a /api/registro, que lo usa
    // como `doc(eventoId)`. Si volviera el código de un evento legacy, el
    // alta buscaría un documento que no existe y diría "no existe".
    const eventoPublico: EventoPublico = {
      eventoId: snapEvento.id,
      nombre: evento.nombre,
      fecha: aIso(evento.fecha),
      lugar: evento.lugar,
      descripcion: evento.descripcion ?? '',
      lugaresRestantes,
      agotado: lugaresRestantes === 0,
      requierePago: Boolean(evento.requierePago),
      precioEntrada: evento.precioEntrada ?? null,
      personalizacion: {
        bannerUrl: limites.bannerPermitido ? p?.bannerUrl ?? null : null,
        logoUrl: limites.logoPermitido ? p?.logoUrl ?? null : null,
        colorPrimario: limites.colorPersonalizadoPermitido ? p?.colorPrimario ?? null : null,
        colorSecundario: limites.colorPersonalizadoPermitido ? p?.colorSecundario ?? null : null,
        textoBienvenida: p?.textoBienvenida ?? null,
        textoConfirmacion: p?.textoConfirmacion ?? null,
      },
    }

    return res.status(200).json({ ok: true, evento: eventoPublico })
  } catch (error) {
    // El error crudo no va al cliente: el mensaje de Firestore a veces
    // trae el nombre del documento, y acá no hace falta para entender
    // nada. Va al log, que sólo ve quien tiene el deploy.
    console.error(`[evento-publico] ${eventoId}:`, error instanceof Error ? error.message : error)
    return res.status(500).json({ ok: false, error: 'No pudimos cargar el evento.' })
  }
}
