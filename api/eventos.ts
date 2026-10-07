import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Transaction } from 'firebase-admin/firestore'

import { getAdminAuth, getDb } from '../src/server/lib/firebase-admin.js'
import { normalizarTexto } from '../src/shared/utils.js'
import { reservarCodigoYSlugEnTransaccion } from '../src/server/lib/codigo.js'
import type { Evento, Organizador } from '../src/shared/types.js'
import { capturarError } from '../src/server/lib/sentry.js'

/**
 * POST /api/eventos — crea un evento con código corto, nombre normalizado y slug en una transacción.
 *
 * El `codigoCorto` ES el id del documento. Es lo que da la unicidad por
 * construcción: `tx.create` falla si el id ya existe y el reintento genera
 * otro código. Sin esto, dos altas simultáneas podrían publicar el mismo
 * código y el buscador devolvería el evento equivocado.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  const authHeader = req.headers.authorization
  let uid: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = await (await getAdminAuth()).verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
    } catch {
      return res.status(401).json({ ok: false, error: 'No autenticado' })
    }
  }
  if (!uid) {
    return res.status(401).json({ ok: false, error: 'No autenticado' })
  }

  try {
    const db = getDb()
    const organizadorSnap = await db.collection('organizadores').doc(uid).get()
    if (!organizadorSnap.exists) {
      return res.status(404).json({ ok: false, error: 'Organizador no encontrado' })
    }

    const organizador = organizadorSnap.data() as Organizador
    if (organizador.estadoSuscripcion !== 'activo') {
      return res.status(403).json({ ok: false, error: 'Tu cuenta está suspendida' })
    }

    const cuerpo = req.body as Partial<{
      nombre: string
      fecha: string
      lugar: string
      descripcion: string
      capacidadMaxima: number
      requierePago: boolean
      precioEntrada: number | null
      visibilidad: 'publico' | 'privado'
      bannerUrl: string | null
    }>

    if (!cuerpo.nombre || !cuerpo.fecha || !cuerpo.lugar) {
      return res.status(400).json({ ok: false, error: 'Falta nombre, fecha o lugar' })
    }

    const nombreLimpio = cuerpo.nombre.trim().slice(0, 80)
    const fecha = new Date(cuerpo.fecha)
    if (isNaN(fecha.getTime())) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida' })
    }

    const capacidadMaxima = Number(cuerpo.capacidadMaxima) || 100
    const limite = organizador.limitesPersonalizacion.capacidadMaximaPorEvento
    if (capacidadMaxima > limite) {
      return res.status(400).json({ ok: false, error: `Tu plan permite hasta ${limite} entradas` })
    }

    const visibilidad = cuerpo.visibilidad === 'publico' ? 'publico' : 'privado'
    // bannerUrl viaja en el alta para que no se pierda: antes el
    // backend lo ignoraba y el banner del formulario nacía en null.
    // Sanitizado acá: sólo http(s). El límite del plan (bannerPermitido)
    // lo siguen validando las reglas.
    const bannerUrl =
      typeof cuerpo.bannerUrl === 'string' && /^https:\/\//.test(cuerpo.bannerUrl.trim())
        ? cuerpo.bannerUrl.trim().slice(0, 500)
        : null
    const nombreNormalizado = normalizarTexto(nombreLimpio)
    const autorId = uid

    let resultado: { codigoCorto: string; slug: string; eventoId: string } | null = null

    await db.runTransaction(async (tx: Transaction) => {
      const { codigoCorto, slug } = await reservarCodigoYSlugEnTransaccion(tx, db, nombreNormalizado)

      // El doc nace con el código como id: la unicidad la impone
      // Firestore, no un `where` que puede correr dos veces igual.
      const refEvento = db.collection('eventos').doc(codigoCorto)
      const eventoData: Partial<Evento> = {
        organizadorId: autorId,
        nombre: nombreLimpio,
        fecha,
        lugar: cuerpo.lugar?.trim() ?? '',
        descripcion: cuerpo.descripcion?.trim() ?? '',
        capacidadMaxima,
        reservas: 0,
        estado: 'activo',
        requierePago: Boolean(cuerpo.requierePago),
        precioEntrada: cuerpo.requierePago && typeof cuerpo.precioEntrada === 'number' ? cuerpo.precioEntrada : null,
        personalizacion: {
          bannerUrl,
          logoUrl: null,
          colorPrimario: null,
          colorSecundario: null,
          textoBienvenida: null,
          textoConfirmacion: null,
        },
        codigoCorto,
        nombreNormalizado,
        slug,
        visibilidad,
      }

      tx.create(refEvento, eventoData)
      resultado = { codigoCorto, slug, eventoId: refEvento.id }
    })

    return res.status(201).json({ ok: true, ...resultado! })
  } catch (error) {
    await capturarError(error, { ruta: '[eventos] POST error:' })
    return res.status(500).json({ ok: false, error: 'No se pudo crear el evento' })
  }
}