import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp } from 'firebase-admin/firestore'

import { getDb } from '../lib/firebase-admin.js'
import type { Registro, Evento } from '../../src/shared/types.js'

type FirestoreTimestamp = Timestamp

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

function escapeCSV(valor: string): string {
  if (valor.includes(',') || valor.includes('"') || valor.includes('\n')) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
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

  // Verificar propiedad
  const snapEvento = await db.collection('eventos').doc(eventoId).get()
  if (!snapEvento.exists) {
    return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
  }
  const evento = snapEvento.data() as Evento
  if (evento.organizadorId !== uid) {
    return res.status(403).json({ ok: false, error: 'No autorizado' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Solo se acepta GET' })
  }

  try {
    // Obtener todos los registros (sin paginar para export)
    const snap = await db.collection('registros').where('eventoId', '==', eventoId).get()
    const registros = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as (Registro & { id: string })[]

    // Ordenar por fechaRegistro descendente
    registros.sort((a, b) => {
      const fa = (a.fechaRegistro as unknown as Timestamp)?.toMillis?.() ?? 0
      const fb = (b.fechaRegistro as unknown as Timestamp)?.toMillis?.() ?? 0
      return fb - fa
    })

    // Generar CSV
    const filas = [CSV_HEADERS.join(','), ...registros.map((r) => registroACSV(r, evento).join(','))]
    const csv = filas.join('\n')

    // Headers para descarga
    const filename = `registros-${evento.nombre.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    // BOM para Excel
    res.send('\uFEFF' + csv)
  } catch (error) {
    console.error('[registros/export] error:', error)
    return res.status(500).json({ ok: false, error: 'Error generando CSV' })
  }
}