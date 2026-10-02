import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp, type Transaction } from 'firebase-admin/firestore'

import { getDb } from './lib/firebase-admin.js'
import { obtenerPagoPorReferencia } from './lib/mercadopago.js'
import { enviarMail } from './lib/mail.js'
import { imagenQrDe } from './lib/qr.js'
import { urlQrDe, resolverBasePublica } from './lib/url.js'
import { type EntradaDelMail } from './lib/email.js'
import type { Registro, Evento } from '../src/shared/types.js'

type FirestoreTimestamp = Timestamp

interface FiltrosRegistro {
  eventoId: string
  search?: string
  estado?: string
  pagoEstado?: string
  limite?: number
  offset?: number
}

async function obtenerRegistros(
  db: ReturnType<typeof getDb>,
  filtros: FiltrosRegistro
): Promise<{ registros: (Registro & { id: string })[]; total: number }> {
  const { eventoId, search, estado, pagoEstado, limite = 50, offset = 0 } = filtros

  let query = db.collection('registros').where('eventoId', '==', eventoId)

  const snap = await query.get()
  let registros = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as (Registro & { id: string })[]

  // Filtros en memoria (para evitar índices complejos)
  if (search) {
    const s = search.toLowerCase()
    registros = registros.filter(
      (r) =>
        r.nombre.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        r.dni.includes(s) ||
        r.id.toLowerCase().includes(s)
    )
  }
  if (estado) {
    registros = registros.filter((r) => r.estado === estado)
  }
  if (pagoEstado) {
    registros = registros.filter((r) => r.pago?.estado === pagoEstado)
  }

  // Ordenar por fechaRegistro descendente
  registros.sort((a, b) => {
    const fa = (a.fechaRegistro as unknown as FirestoreTimestamp)?.toMillis?.() ?? 0
    const fb = (b.fechaRegistro as unknown as FirestoreTimestamp)?.toMillis?.() ?? 0
    return fb - fa
  })

  const total = registros.length
  const paginados = registros.slice(offset, offset + limite)

  return { registros: paginados, total }
}

const CSV_HEADERS = [
  'ID Reserva',
  'Nombre',
  'Email',
  'DNI',
  'Fecha Nacimiento',
  'Teléfono',
  'Estado Reserva',
  'Estado Pago',
  'Monto Pagado',
  'Medio Pago',
  'ID Transacción',
  'Fecha Pago',
  'Usado',
  'Fecha Uso',
  'Fecha Registro',
  'Evento Nombre',
  'Evento Fecha',
  'Evento Lugar',
]

function escapeCSV(valor: string): string {
  if (valor.includes(',') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

function registroACSV(registro: Registro & { id: string }, evento: Evento): string[] {
  const fechaReg = (registro.fechaRegistro as unknown as FirestoreTimestamp)?.toDate?.() ?? new Date(registro.fechaRegistro)
  const fechaUso = (registro.fechaUso as unknown as FirestoreTimestamp)?.toDate?.() ?? (registro.fechaUso ? new Date(registro.fechaUso) : null)

  return [
    registro.id,
    escapeCSV(registro.nombre),
    escapeCSV(registro.email),
    escapeCSV(registro.dni),
    escapeCSV(registro.fechaNacimiento),
    escapeCSV(registro.telefono || ''),
    escapeCSV(registro.estado),
    escapeCSV(registro.pago?.estado || 'no_aplica'),
    escapeCSV(registro.pago?.montoPagado?.toString() || ''),
    escapeCSV(registro.pago?.medioPago || ''),
    escapeCSV(registro.pago?.idTransaccion || ''),
    escapeCSV((registro.pago?.fechaPago as unknown as FirestoreTimestamp)?.toDate?.().toISOString() || ''),
    registro.usado ? 'Sí' : 'No',
    escapeCSV(fechaUso ? fechaUso.toISOString() : ''),
    escapeCSV(fechaReg.toISOString()),
    escapeCSV(evento.nombre),
    escapeCSV(evento.fecha.toISOString()),
    escapeCSV(evento.lugar),
  ]
}

async function handleListRegistros(req: VercelRequest, res: VercelResponse, db: ReturnType<typeof getDb>, eventoId: string, _uid: string) {
  const search = (req.query.search as string) || ''
  const estado = (req.query.estado as string) || ''
  const pagoEstado = (req.query.pagoEstado as string) || ''
  const limite = Math.min(parseInt((req.query.limite as string) || '50', 10), 200)
  const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0)

  try {
    const { registros, total } = await obtenerRegistros(db, {
      eventoId,
      search,
      estado,
      pagoEstado,
      limite,
      offset,
    })

    return res.status(200).json({ ok: true, registros, total })
  } catch (error) {
    console.error('[registros] error:', error)
    return res.status(500).json({ ok: false, error: 'Error obteniendo registros' })
  }
}

async function handleExportRegistros(res: VercelResponse, db: ReturnType<typeof getDb>, eventoId: string, evento: Evento) {
  try {
    const snap = await db.collection('registros').where('eventoId', '==', eventoId).get()
    const registros = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as (Registro & { id: string })[]

    registros.sort((a: Registro & { id: string }, b: Registro & { id: string }) => {
      const fa = (a.fechaRegistro as unknown as Timestamp)?.toMillis?.() ?? 0
      const fb = (b.fechaRegistro as unknown as Timestamp)?.toMillis?.() ?? 0
      return fb - fa
    })

    const filas = [CSV_HEADERS.join(','), ...registros.map((r) => registroACSV(r, evento).join(','))]
    const csv = filas.join('\n')

    const filename = `registros-${evento.nombre.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    res.send('\uFEFF' + csv)
  } catch (error) {
    console.error('[registros/export] error:', error)
    return res.status(500).json({ ok: false, error: 'Error generando CSV' })
  }
}

async function handleResendRegistros(req: VercelRequest, res: VercelResponse, db: ReturnType<typeof getDb>, eventoId: string, evento: Evento) {
  const { registroIds } = req.body as { registroIds?: string[] }

  if (!registroIds || registroIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'Falta registroIds' })
  }

  try {
    const base = resolverBasePublica(req.headers, process.env)
    let enviados = 0
    let fallidos = 0

    for (const registroId of registroIds) {
      const snapReg = await db.collection('registros').doc(registroId).get()
      if (!snapReg.exists) {
        fallidos++
        continue
      }
      const registro = snapReg.data() as Registro
      if (registro.eventoId !== eventoId) {
        fallidos++
        continue
      }

      const token = obtenerPagoPorReferencia(registroId)?.preferenceId
        ? `mock_token_${registroId}`
        : registroId

      try {
        const urlQr = urlQrDe(token, base, eventoId)
        const imagenQr = await imagenQrDe(urlQr)

        const entrada: EntradaDelMail = {
          destinatario: registro.email,
          nombreAsistente: registro.nombre,
          urlQr,
          imagenQr,
          evento: {
            eventoId,
            nombre: evento.nombre,
            fechaIso: evento.fecha.toISOString(),
            lugar: evento.lugar,
            textoConfirmacion: evento.personalizacion?.textoConfirmacion ?? null,
            colorPrimario: evento.personalizacion?.colorPrimario ?? null,
          },
        }

        const resultado = await enviarMail(entrada)
        if (resultado.enviado) {
          enviados++
        } else {
          fallidos++
        }
      } catch {
        fallidos++
      }
    }

    return res.status(200).json({ ok: true, enviados, fallidos })
  } catch (error) {
    console.error('[registros/resend] error:', error)
    return res.status(500).json({ ok: false, error: 'Error reenviando mails' })
  }
}

async function handleRecountRegistros(_req: VercelRequest, res: VercelResponse, db: ReturnType<typeof getDb>, eventoId: string) {
  try {
    const resultado = await db.runTransaction(
      async (tx: Transaction) => {
      const snap = await tx.get(
        db.collection('registros')
          .where('eventoId', '==', eventoId)
          .where('estado', 'in', ['aprobado', 'pendiente'])
      )

      const total = snap.docs.length

      const refEvento = db.collection('eventos').doc(eventoId)
      await tx.set(refEvento, { reservas: total }, { merge: true })

      return { total }
    })

    return res.status(200).json({ ok: true, reservas: resultado.total })
  } catch (error) {
    console.error('[registros/recount] error:', error)
    return res.status(500).json({ ok: false, error: 'Error en reconteo' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  const db = getDb()
  const { eventoId } = req.query

  if (!eventoId || typeof eventoId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Falta eventoId' })
  }

  // Auth
  const authHeader = req.headers.authorization
  let uid: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { getAuth } = await import('firebase-admin/auth')
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
    } catch {}
  }
  if (!uid) {
    uid = req.headers['x-user-uid'] as string | undefined
  }
  if (!uid) {
    return res.status(401).json({ ok: false, error: 'No autenticado' })
  }

  // Verificar propiedad del evento
  const snapEvento = await db.collection('eventos').doc(eventoId).get()
  if (!snapEvento.exists) {
    return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
  }
  const evento = snapEvento.data() as Evento
  if (evento.organizadorId !== uid) {
    return res.status(403).json({ ok: false, error: 'No autorizado' })
  }

  // Router por path
  const path = req.url?.split('?')[0] || ''

  if (path.endsWith('/export')) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
    }
    return handleExportRegistros(res, db, eventoId, evento)
  }

  if (path.endsWith('/recount')) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
    }
    return handleRecountRegistros(req, res, db, eventoId)
  }

  if (path.endsWith('/resend')) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
    }
    return handleResendRegistros(req, res, db, eventoId, evento)
  }

  // Default: GET /api/registros?eventoId=xxx
  if (req.method === 'GET') {
    return handleListRegistros(req, res, db, eventoId, uid)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Método no permitido' })
}