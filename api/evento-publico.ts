import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Timestamp } from 'firebase-admin/firestore'

import { getDb } from '../src/server/lib/firebase-admin.js'
import type { Evento, Organizador } from '../src/shared/types.js'

/**
 * GET /api/evento-publico?id=... — landing sin sesión.
 *
 * Las reglas no dejan leer /eventos sin sesión, así que lee el Admin SDK
 * y devuelve SOLO la lista blanca de abajo. Nada de `{...evento}` nunca:
 * cualquier campo nuevo del modelo se publicaría solo.
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
  organizador?: {
    nombre: string
    descripcion: string
    logoUrl: string | null
    instagram: string | null
    web: string | null
  }
}

/** Un mismo 404 para "no existe", "cerrado" y "suspendido": distinguirlos filtraría. */
function noEncontrado(res: VercelResponse) {
  return res.status(404).json({
    ok: false,
    error: 'Ese evento no existe o ya no está disponible.',
  })
}

/** El `id` se valida ([A-Za-z0-9_-]{1,1500}): sin esto un `/` o `.` da 500 en vez de 400. */
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
  // no-store: el cupo y el cierre cambian seguido, y el caché es compartido.
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
        // El evento manda; si no definió, caen los defaults de la cuenta.
        textoBienvenida: p?.textoBienvenida ?? organizador.textoBienvenida ?? null,
        textoConfirmacion: p?.textoConfirmacion ?? organizador.textoConfirmacion ?? null,
      },
      // Lo público del organizador: la landing lo usa para "Organizado por".
      organizador: {
        nombre: organizador.nombre,
        descripcion: organizador.descripcion ?? '',
        logoUrl: organizador.brandingPanel?.logoUrl ?? null,
        instagram: organizador.redesSociales?.instagram ?? null,
        web: organizador.redesSociales?.web ?? null,
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
