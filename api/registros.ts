import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Timestamp, type Transaction } from 'firebase-admin/firestore'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

import { getAdminAuth, getDb } from '../src/server/lib/firebase-admin.js'
import { enviarMail } from '../src/server/lib/mail.js'
import { generarToken, hashearToken, imagenQrDe } from '../src/server/lib/qr.js'
import { urlQrDe, resolverBasePublica } from '../src/server/lib/url.js'
import { type EntradaDelMail } from '../src/server/lib/email.js'
import type { Registro, Evento } from '../src/shared/types.js'
import { capturarError } from '../src/server/lib/sentry.js'

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
  let registros = snap.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as (Registro & { id: string })[]

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
    await capturarError(error, { ruta: '[registros]' })
    return res.status(500).json({ ok: false, error: 'Error obteniendo registros' })
  }
}

async function handleExportRegistros(res: VercelResponse, db: ReturnType<typeof getDb>, eventoId: string, evento: Evento) {
  try {
    const snap = await db.collection('registros').where('eventoId', '==', eventoId).get()
    const registros = snap.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as (Registro & { id: string })[]

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
    await capturarError(error, { ruta: '[registros/export]' })
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

      // Reenviar implica ROTAR el token, y hay que decirlo.
      //
      // El token en claro no se guarda (solo su SHA-256, en `qrHash`), así
      // que el reenvío no puede volver a armar el mismo QR: no hay de
      // dónde sacarlo. La única forma de mandarle al asistente un código
      // que funcione es generar uno nuevo y cambiar la huella guardada.
      //
      // Antes se hacía `mock_token_${registroId}`, que no era un token
      // válido bajo ningún aspecto: no pasaba `esFormatoToken` (misma
      // longitud que un id de Firestore, no 32 chars base64url) y
      // aunque pasara, hashearlo daba una huella que no era el id de
      // ningún registro. O sea: un QR con forma de QR que en la puerta
      // decía "Ese código no existe".
      //
      // El costo del rotate es que el QR del mail anterior deja de
      // validar. Es aceptable y es lo que espera quien reenvía (perdió el
      // mail), pero tiene que quedar dicho en la respuesta para que el
      // organizador lo sepa y no asuma que las dos copias sirven.
      const token = generarToken()
      const qrHashNuevo = hashearToken(token)

      // Un choque de hash sobre otro registro no se pisa: se cuenta como
      // fallido y se sigue. Son 192 bits, pero el costo de mirarlo es una
      // lectura y el de no mirarlo es corromper el QR de otro invitado.
      const snapChoque = await db.collection('registros').doc(qrHashNuevo).get()
      if (snapChoque.exists && snapChoque.id !== snapReg.id) {
        fallidos++
        continue
      }

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
        if (!resultado.enviado) {
          // El mail NO salió, así que el QR anterior tiene que seguir
          // sirviendo. Rotar acá dejaba al asistente sin ninguna entrada
          // válida: la vieja muerta por el rotate y la nueva que nunca
          // llegó. Es el peor de los dos mundos y por eso el update va
          // después del envío, no antes.
          fallidos++
          continue
        }

        // Ahora sí: el mail está en la bandeja, se puede dar de baja el
        // token viejo.
        await snapReg.ref.update({
          qrHash: qrHashNuevo,
          tokenEmitidoEn: Timestamp.now(),
        })
        enviados++
      } catch {
        fallidos++
      }
    }

    // `rotados` va en la respuesta a propósito: el organizador tiene que
    // saber que el QR del mail anterior dejó de validar. Si no lo sabe,
    // va a probar con las dos copias en la puerta y la segunda va a decir
    // "ya usado" o "no existe" sin explicación.
    return res.status(200).json({ ok: true, enviados, fallidos, tokensRotados: enviados })
  } catch (error) {
    await capturarError(error, { ruta: '[registros/resend]' })
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
    await capturarError(error, { ruta: '[registros/recount]' })
    return res.status(500).json({ ok: false, error: 'Error en reconteo' })
  }
}

/**
 * PATCH /api/registros/<registroId>?eventoId=... — edita una reserva.
 *
 * Solo `estado`, `nombre`, `email` y `telefono`: el mismo vocabulario que
 * `soloCamposDelOrganizador()` en las reglas. `usado`, `fechaUso`,
 * `qrHash`, `pago` y `eventoId` no se tocan por acá: el QR lo rota el
 * reenvío y el uso lo marca la puerta.
 */
async function handleActualizarRegistro(
  req: VercelRequest,
  res: VercelResponse,
  db: ReturnType<typeof getDb>,
  eventoId: string,
  registroId: string,
) {
  const cuerpo = (req.body ?? {}) as {
    estado?: unknown
    nombre?: unknown
    email?: unknown
    telefono?: unknown
  }
  const cambios: Record<string, unknown> = {}

  if (cuerpo.estado !== undefined) {
    if (cuerpo.estado !== 'pendiente' && cuerpo.estado !== 'aprobado' && cuerpo.estado !== 'rechazado') {
      return res.status(400).json({ ok: false, error: 'Estado inválido.' })
    }
    cambios.estado = cuerpo.estado
  }
  if (cuerpo.nombre !== undefined) {
    const nombre = String(cuerpo.nombre).trim()
    if (nombre.length < 2 || nombre.length > 80) {
      return res.status(400).json({ ok: false, error: 'El nombre tiene que tener entre 2 y 80 caracteres.' })
    }
    cambios.nombre = nombre
  }
  if (cuerpo.email !== undefined) {
    const email = String(cuerpo.email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ ok: false, error: 'El correo no es válido.' })
    }
    cambios.email = email
  }
  if (cuerpo.telefono !== undefined) {
    const telefono = String(cuerpo.telefono).trim().slice(0, 32)
    cambios.telefono = telefono
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ ok: false, error: 'No pediste ningún cambio.' })
  }

  try {
    const ref = db.collection('registros').doc(registroId)
    const snap = await ref.get()
    if (!snap.exists) {
      return res.status(404).json({ ok: false, error: 'Esa reserva no existe.' })
    }
    if ((snap.data() as Registro).eventoId !== eventoId) {
      return res.status(403).json({ ok: false, error: 'No autorizado.' })
    }
    await ref.update(cambios)
    return res.status(200).json({ ok: true })
  } catch (error) {
    await capturarError(error, { ruta: '[registros/actualizar]' })
    return res.status(500).json({ ok: false, error: 'No se pudo guardar.' })
  }
}

/**
 * DELETE /api/registros/<registroId>?eventoId=... — borra una reserva.
 *
 * No toca el contador `reservas` del evento (cuenta emitidas, no vivas):
 * si el cupo quedó mentiroso, el botón "Recalcular cupo" lo recompone.
 */
async function handleEliminarRegistro(
  res: VercelResponse,
  db: ReturnType<typeof getDb>,
  eventoId: string,
  registroId: string,
) {
  try {
    const ref = db.collection('registros').doc(registroId)
    const snap = await ref.get()
    if (!snap.exists) {
      return res.status(404).json({ ok: false, error: 'Esa reserva no existe.' })
    }
    if ((snap.data() as Registro).eventoId !== eventoId) {
      return res.status(403).json({ ok: false, error: 'No autorizado.' })
    }
    await ref.delete()
    return res.status(200).json({ ok: true })
  } catch (error) {
    await capturarError(error, { ruta: '[registros/eliminar]' })
    return res.status(500).json({ ok: false, error: 'No se pudo borrar.' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  const db = getDb()
  const { eventoId } = req.query

  if (!eventoId || typeof eventoId !== 'string') {
    return res.status(400).json({ ok: false, error: 'Falta eventoId' })
  }

  // Auth: el uid sale del ID token verificado por Firebase, y de ningún
  // otro lado. Antes caía a `x-user-uid` cuando no había Authorization, y
  // eso rompía toda la autorización de abajo: con mandarle el header, el
  // chequeo de propiedad (`evento.organizadorId !== uid`) comparaba el
  // uid que el cliente quiso, no el de quien realmente está conectado, y
  // daba acceso a los registros de cualquier evento.
  const authHeader = req.headers.authorization
  let uid: string | undefined
  if (authHeader?.startsWith('Bearer ')) {
    try {
      // `getAdminAuth()` y no `getAuth()`: acá el `catch {}` convertía un
      // `app/no-app` en "No autenticado" (401). Hoy zafa de milagro porque
      // `getDb()` corrió en la línea 303, pero esa es una promesa que otro
      // puede romper sin querer. Ver `getAdminAuth()`.
      const decoded = await (await getAdminAuth()).verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
    } catch {}
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

  // /api/registros/<registroId>?eventoId=... — editar o borrar una
  // reserva puntual. La propiedad ya quedó verificada arriba contra el
  // evento, y acá se verifica que el registro sea DE ese evento: sin ese
  // segundo chequeo, un organizador podría editar reservas ajenas pasando
  // su propio eventoId con el id de otro registro.
  const partes = path.split('/').filter(Boolean)
  const registroId = partes.length > 2 ? partes[partes.length - 1] : null
  if (registroId && !['export', 'recount', 'resend'].includes(registroId)) {
    if (req.method === 'PATCH') {
      return handleActualizarRegistro(req, res, db, eventoId, registroId)
    }
    if (req.method === 'DELETE') {
      return handleEliminarRegistro(res, db, eventoId, registroId)
    }
    res.setHeader('Allow', 'PATCH, DELETE')
    return res.status(405).json({ ok: false, error: 'Método no permitido' })
  }

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