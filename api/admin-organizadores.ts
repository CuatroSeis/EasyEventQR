import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import type {
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { FieldPath } from 'firebase-admin/firestore'

import { getDb } from '@server/firebase-admin.js'
import {
  LIMITES_POR_PLAN,
  type EstadoSuscripcion,
  type Organizador,
  type Plan,
} from '../src/shared/types.js'

/**
 * Router del panel super-admin.
 *
 * POR QUÉ UN SOLO ARCHIVO
 *
 * El plan Hobby de Vercel corta en 12 funciones serverless por despliegue y
 * cada archivo en `api/` es una. La app ya tiene nueve. Un endpoint por
 * pantalla —dashboard, eventos, registros, excepciones, auditoría— nos
 * dejaría en catorce y Vercel rechazaría el despliegue con "No more than
 * 12 Serverless Functions". Por eso todo se enruta con `?accion=` desde
 * adentro del handler.
 *
 * Quedan tres funciones de margen. Si alguna vez hay que agregar una, que
 * sea en serio: primero se mira de fusionar con otra.
 *
 * AUTORIZACIÓN
 *
 * Se verifica el ID token de Firebase con `verifyIdToken` y el super-admin
 * se reconoce por DOS vías, no por una sola:
 *
 *   a) el custom claim `admin == true`, que es lo mismo que miran las
 *      reglas de Firestore (ver `esSuperAdmin()` en firestore.rules), y
 *   b) el UID igual a `SUPER_ADMIN_UID`.
 *
 * Que antes sólo aceptara (b) dejaba el sistema partido en dos: un admin
 * con el claim pasaba las reglas pero se comía un 403 en el panel, y un
 * admin por env podía operar la API sin poder escribir por las reglas. Los
 * dos mecanismos sonLegítimos, así que se acepta cualquiera de los dos.
 *
 * (b) se queda como break-glass a propósito: las reglas de Firestore NO
 * pueden leer variables de entorno, así que el claim es la única vía que
 * ambos lados comparten. Y si algún día se pierde el acceso por un token
 * viejo, `SUPER_ADMIN_UID` sigue siendo la puerta de atrás sin depender de
 * que nadie pueda reemitir el token.
 *
 * Antes se aceptaba además un header `x-user-uid` que mandaba el cliente, y
 * eso no autorizaba nada: un header es una afirmación del cliente, no una
 * credencial. Con sólo conocer el UID del super-admin —que es público,
 * viaja en la URL del panel— cualquiera se autopromovía.
 */

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID

interface AdminAutenticado {
  uid: string
  email: string
}

type Limites = Organizador['limitesPersonalizacion']

const CAMPOS_LIMITE: (keyof Limites)[] = [
  'bannerPermitido',
  'colorPersonalizadoPermitido',
  'logoPermitido',
  'capacidadMaximaPorEvento',
]

/** Máximo de registros que se leen para el listado global de la Fase 8. */
const TOPE_LECTURA = 2000

/** Tope de lotes de Firestore: 500 escrituras por batch. */
const TOPE_LOTE = 400

function esPlan(valor: unknown): valor is Plan {
  return valor === 'gratis' || valor === 'pro' || valor === 'pro+'
}

function esEstadoSuscripcion(valor: unknown): valor is EstadoSuscripcion {
  return valor === 'activo' || valor === 'suspendido'
}

/**
 * Exige un super-admin real.
 *
 * Devuelve `null` y ya respondió cuando no hay token válido o el token no
 * es del super-admin. "Sin token" y "token de otro" devuelven el mismo
 * 401 a propósito: distinguirlos le diría a un atacante si el UID existe.
 */
async function autenticar(req: VercelRequest, res: VercelResponse): Promise<AdminAutenticado | null> {
  if (!SUPER_ADMIN_UID) {
    // Sin la variable de entorno NO se corta: el claim `admin` por sí solo
    // alcanza, que es el mecanismo que comparten las reglas de Firestore.
    // Antes esto cortaba el panel entero si faltaba la variable, y como
    // `scripts/asignar-admin.mjs` es lo que asigna el claim, un entorno
    // nuevo sin `SUPER_ADMIN_UID` se quedaba sin panel y sin pista de por
    // qué. Se avisa igual, porque si el claim existe y la variable no, el
    // break-glass no está.
    console.warn('[admin] falta SUPER_ADMIN_UID: sólo funciona el custom claim admin')
  }

  const cabecera = req.headers.authorization
  if (!cabecera?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Falta el token de sesión.' })
    return null
  }

  try {
    const decodificado = await getAuth().verifyIdToken(cabecera.slice(7))

    // El claim manda, y el UID por variable es el break-glass. Ojo con
    // `decodificado.admin` a secas: cuando el claim no existe no es
    // `undefined`, es una excepción al acceder, y la excepción se
    // convierte en un 500 en vez de un 403.
    const esAdminPorClaim = decodificado.admin === true
    const esAdminPorUid = Boolean(SUPER_ADMIN_UID) && decodificado.uid === SUPER_ADMIN_UID

    if (!esAdminPorClaim && !esAdminPorUid) {
      res.status(403).json({ ok: false, error: 'No autorizado.' })
      return null
    }

    return { uid: decodificado.uid, email: decodificado.email ?? '' }
  } catch {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado.' })
    return null
  }
}

/**
 * Anota una acción del super-admin.
 *
 * Va a su propia colección (`auditoria`) y se escribe con el Admin SDK, así
 * que las reglas de Firestore no aplican. Que sea una colección aparte y no
 * un campo del organizador es a propósito: si el rastro viviera en el
 * documento del cliente, un organizador con permiso de update podría
 * borrarse a sí mismo del historial.
 *
 * Nunca tira. Si la auditoría falla, la acción que el admin ya confirmó no
 * debería revertirse, ni dejarlo creyendo que no ocurrió.
 */
async function auditar(
  db: Firestore,
  admin: AdminAutenticado,
  entrada: { accion: string; entidad: string; entidadId: string; detalles?: Record<string, unknown> },
): Promise<void> {
  try {
    await db.collection('auditoria').add({
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      usuarioId: admin.uid,
      usuarioEmail: admin.email,
      detalles: entrada.detalles ?? {},
      creadoEn: new Date(),
    })
  } catch (error) {
    console.error('[admin] no se pudo auditar:', error)
  }
}

/** Firestore devuelve `Date` por el Admin SDK, pero un doc viejo puede traer Timestamp o string. */
function comoFecha(valor: unknown): Date | string | null {
  if (valor instanceof Date) return valor
  if (valor && typeof valor === 'object' && 'toDate' in valor) {
    return (valor as { toDate: () => Date }).toDate()
  }
  return typeof valor === 'string' ? valor : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await autenticar(req, res)
  if (!admin) return

  const db = getDb()
  const accion = typeof req.query.accion === 'string' ? req.query.accion : 'organizadores'

  try {
    switch (accion) {
      case 'organizadores':
        return await rutasOrganizadores(req, res, db, admin)
      case 'dashboard':
        return await rutaDashboard(res, db)
      case 'eventos':
        return await rutaEventos(req, res, db, admin)
      case 'registros':
        return await rutaRegistros(req, res, db)
      case 'excepciones':
        return await rutaExcepciones(req, res, db, admin)
      case 'auditoria':
        return await rutaAuditoria(req, res, db)
      default:
        return res.status(404).json({ ok: false, error: `Acción desconocida: ${accion}` })
    }
  } catch (error) {
    console.error(`[admin/${accion}] error:`, error)
    return res.status(500).json({ ok: false, error: 'Error interno del panel.' })
  }
}

/* ------------------------------------------------------------------ */
/* Organizadores                                                       */
/* ------------------------------------------------------------------ */

async function rutasOrganizadores(
  req: VercelRequest,
  res: VercelResponse,
  db: Firestore,
  admin: AdminAutenticado,
) {
  if (req.method === 'GET') {
    const snapshot = await db.collection('organizadores').orderBy('fechaAlta', 'desc').get()
    const organizadores = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      ...(doc.data() as Organizador),
      uid: doc.id,
    }))
    return res.status(200).json({ ok: true, organizadores })
  }

  const cuerpo = (req.body ?? {}) as {
    uid?: string
    plan?: unknown
    estadoSuscripcion?: unknown
  }
  const uid = typeof cuerpo.uid === 'string' ? cuerpo.uid : ''

  if (req.method === 'PATCH') {
    if (!uid) {
      return res.status(400).json({ ok: false, error: 'Falta el uid del organizador.' })
    }
    const referencia = db.collection('organizadores').doc(uid)
    const actual = await referencia.get()
    if (!actual.exists) {
      return res.status(404).json({ ok: false, error: 'Ese organizador no existe.' })
    }
    const organizador = actual.data() as Organizador

    const cambios: Record<string, unknown> = {}
    let accionAuditoria: string

    if (cuerpo.plan !== undefined) {
      if (!esPlan(cuerpo.plan)) {
        return res.status(400).json({ ok: false, error: 'Plan inválido.' })
      }
      cambios['plan'] = cuerpo.plan
      // Los límites siguen al plan salvo que el organizador tenga una
      // excepción comercial: pisar `limitesPersonalizacion` acá borraría
      // a mano una excepción que el admin concedió, y eso sería una pérdida
      // de datos silenciosa causada por cambiar un campo que no tiene nada
      // que ver con el plan.
      if (!tieneExcepcion(organizador)) {
        cambios['limitesPersonalizacion'] = LIMITES_POR_PLAN[cuerpo.plan]
      }
      accionAuditoria = 'cambiar-plan'
    } else if (cuerpo.estadoSuscripcion !== undefined) {
      if (!esEstadoSuscripcion(cuerpo.estadoSuscripcion)) {
        return res.status(400).json({ ok: false, error: 'Estado de suscripción inválido.' })
      }
      cambios['estadoSuscripcion'] = cuerpo.estadoSuscripcion
      accionAuditoria = cuerpo.estadoSuscripcion === 'suspendido' ? 'suspender' : 'reactivar'

      // Suspenderse a uno mismo no tiene vuelta atrás desde la UI.
      //
      // `organizacionActiva()` en firestore.rules exige
      // `estadoSuscripcion == 'activo'`, así que en el momento en que el
      // admin se suspende, su propia sesión pierde permiso para crear y
      // editar eventos. Y como el panel `/panel` lee el documento con las
      // MISMAS reglas, tampoco puede usar las pantallas que lo
      // reactivarían. Se queda del lado de afuera de su propia cuenta, sin
      // mensaje que explique por qué.
      //
      // El guard compara contra `admin.uid` y no contra `SUPER_ADMIN_UID`
      // por lo mismo que el de eliminar: la variable de entorno puede no
      // estar puesta, o ser otro uid, y el guard no se activaría.
      if (cuerpo.estadoSuscripcion === 'suspendido' && uid === admin.uid) {
        return res.status(400).json({
          ok: false,
          error: 'No podés suspender tu propia cuenta: te quedarías sin acceso al panel.',
        })
      }
    } else {
      return res.status(400).json({ ok: false, error: 'No pediste ningún cambio.' })
    }

    await referencia.update(cambios)
    await auditar(db, admin, {
      accion: accionAuditoria,
      entidad: 'organizador',
      entidadId: uid,
      detalles: cambios,
    })

    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (req.query.confirmar !== 'eliminar') {
      return res.status(400).json({ ok: false, error: 'Falta la confirmación de borrado.' })
    }
    if (!uid) {
      return res.status(400).json({ ok: false, error: 'Falta el uid del organizador.' })
    }
    if (uid === admin.uid) {
      // Comparar contra `admin.uid`, NO contra `SUPER_ADMIN_UID`.
      //
      // Desde que la autenticación acepta el claim `admin` además de la
      // variable, un super-admin legítimo puede tener un uid distinto del
      // de `SUPER_ADMIN_UID` (o la variable puede no estar puesta). Con la
      // comparación vieja, ese admin pasaba el guard y se borraba su propia
      // cuenta, dejando el panel sin dueño y sin vuelta atrás.
      //
      // `admin.uid` es el que se verificó con `verifyIdToken` en esta misma
      // request, así que no se puede falsear.
      return res.status(400).json({ ok: false, error: 'No podés eliminar tu propia cuenta.' })
    }

    const eventos = await db.collection('eventos').where('organizadorId', '==', uid).get()
    let eliminados = 0

    for (const docEvento of eventos.docs) {
      const registros = await db.collection('registros').where('eventoId', '==', docEvento.id).get()
      await eliminarEnLotes(
        db,
        registros.docs.map((d: QueryDocumentSnapshot) => d.ref),
      )
      eliminados += registros.size
      await docEvento.ref.delete()
      eliminados += 1
    }

    await db.collection('organizadores').doc(uid).delete()
    eliminados += 1

    // La cuenta de Auth se borra además del documento: si `doc.delete()`
    // falló, el usuario conserva acceso a Firebase sin ningún dato, que
    // es una sesión viva sin dueño.
    try {
      await getAuth().deleteUser(uid)
    } catch (error) {
      console.error('[admin] no se pudo borrar la cuenta de Auth:', error)
    }

    await auditar(db, admin, {
      accion: 'eliminar-organizador',
      entidad: 'organizador',
      entidadId: uid,
      detalles: { documentosEliminados: eliminados },
    })

    return res.status(200).json({ ok: true, eliminados })
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE')
  return res.status(405).json({ ok: false, error: 'Método no permitido' })
}

/** Borra en bloques: un batch de Firestore admite 500 escrituras, no más. */
async function eliminarEnLotes(db: Firestore, referencias: DocumentReference[]): Promise<void> {
  for (let i = 0; i < referencias.length; i += TOPE_LOTE) {
    const lote = referencias.slice(i, i + TOPE_LOTE)
    const batch = db.batch()
    for (const ref of lote) batch.delete(ref)
    await batch.commit()
  }
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

async function rutaDashboard(res: VercelResponse, db: Firestore) {
  // Todo con count()/sum(): son consultas de agregación que corren en el
  // servidor de Firestore y no bajan ni un documento. Contar trayendo los
  // documentos a la función sería leer cientos de miles de registros para
  // devolver un entero, y en un plan Hobby eso es la diferencia entre un
  // panel que responde y uno que expira.
  const desdeHoy = new Date()
  desdeHoy.setHours(0, 0, 0, 0)

  const [
    totalOrganizadores,
    activos,
    totalEventos,
    eventosActivos,
    totalRegistros,
    entradasUsadas,
    registrosHoy,
    pagos,
  ] = await Promise.all([
    db.collection('organizadores').count().get(),
    db.collection('organizadores').where('estadoSuscripcion', '==', 'activo').count().get(),
    db.collection('eventos').count().get(),
    db.collection('eventos').where('estado', '==', 'activo').count().get(),
    db.collection('registros').count().get(),
    db.collection('registros').where('usado', '==', true).count().get(),
    db.collection('registros').where('fechaRegistro', '>=', desdeHoy).count().get(),
    // `sum()` no está disponible en la versión del Admin SDK que usa el
    // proyecto, así que el total se arma leyendo UN campo, no los
    // documentos completos. Sigue siendo O(pagados) en memoria, que para
    // una base en crecimiento conviene reemplazar por un contador
    // acumulado en `eventos` cuando moleste.
    db.collection('registros').where('pago.estado', '==', 'pagado').select('pago.montoPagado').get(),
  ])

  let ingresosMes = 0
  for (const doc of pagos.docs) {
    const monto = (doc.data() as { pago?: { montoPagado?: number | null } }).pago?.montoPagado
    if (typeof monto === 'number' && Number.isFinite(monto)) ingresosMes += monto
  }

  const total = totalOrganizadores.data().count
  const activosCount = activos.data().count

  return res.status(200).json({
    ok: true,
    stats: {
      totalOrganizadores: total,
      organizadoresActivos: activosCount,
      organizadoresSuspendidos: total - activosCount,
      totalEventos: totalEventos.data().count,
      eventosActivos: eventosActivos.data().count,
      totalRegistros: totalRegistros.data().count,
      registrosHoy: registrosHoy.data().count,
      entradasUsadas: entradasUsadas.data().count,
      ingresosMes,
    },
  })
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

interface FichaOrganizador {
  nombre: string
  email: string
  organizadorId: string
}

async function rutaEventos(
  req: VercelRequest,
  res: VercelResponse,
  db: Firestore,
  admin: AdminAutenticado,
) {
  if (req.method === 'GET') {
    const snapshot = await db.collection('eventos').orderBy('fecha', 'desc').limit(500).get()
    const nombres = await cargarOrganizadores(db)

    const eventos = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const datos = doc.data() as Record<string, unknown>
      const organizadorId = String(datos['organizadorId'] ?? '')
      const ficha = nombres.get(organizadorId)
      return {
        id: doc.id,
        organizadorId,
        organizadorNombre: ficha?.nombre ?? '—',
        organizadorEmail: ficha?.email ?? '',
        nombre: datos['nombre'],
        fecha: comoFecha(datos['fecha']),
        lugar: datos['lugar'],
        descripcion: datos['descripcion'],
        capacidadMaxima: datos['capacidadMaxima'],
        reservas: datos['reservas'] ?? 0,
        estado: datos['estado'],
        requierePago: datos['requierePago'] ?? false,
        precioEntrada: datos['precioEntrada'] ?? null,
        creadoEn: comoFecha(datos['creadoEn']),
      }
    })

    return res.status(200).json({ ok: true, eventos })
  }

  if (req.method === 'PATCH') {
    const { eventoId, estado } = (req.body ?? {}) as { eventoId?: string; estado?: unknown }
    if (typeof eventoId !== 'string' || !eventoId) {
      return res.status(400).json({ ok: false, error: 'Falta el id del evento.' })
    }
    if (estado !== 'activo' && estado !== 'cerrado') {
      return res.status(400).json({ ok: false, error: 'Estado de evento inválido.' })
    }

    const referencia = db.collection('eventos').doc(eventoId)
    if (!(await referencia.get()).exists) {
      return res.status(404).json({ ok: false, error: 'Ese evento no existe.' })
    }

    await referencia.update({ estado })
    await auditar(db, admin, {
      accion: estado === 'cerrado' ? 'cerrar-evento' : 'reabrir-evento',
      entidad: 'evento',
      entidadId: eventoId,
      detalles: { estado },
    })

    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, PATCH')
  return res.status(405).json({ ok: false, error: 'Método no permitido' })
}

/* ------------------------------------------------------------------ */
/* Registros                                                           */
/* ------------------------------------------------------------------ */

/**
 * Registros de TODOS los eventos.
 *
 * Endpoint distinto del `/api/registros` del panel del organizador a
 * propósito: aquel exige `eventoId` y verifica que el evento sea del
 * usuario que pregunta. Reusarlo con un `eventoId` vacío no era opción —
 * habría significado abrirle a cualquier organizador la lista completa de
 * la base—, así que el recorrido global vive acá, detrás del chequeo de
 * super-admin.
 */
async function rutaRegistros(req: VercelRequest, res: VercelResponse, db: Firestore) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : ''
  const estado = typeof req.query.estado === 'string' ? req.query.estado : ''
  const pagoEstado = typeof req.query.pagoEstado === 'string' ? req.query.pagoEstado : ''
  const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const snapshot = await db
    .collection('registros')
    .orderBy('fechaRegistro', 'desc')
    .limit(TOPE_LECTURA)
    .get()

  const todos: (Record<string, unknown> & { id: string })[] = snapshot.docs.map(
    (doc: QueryDocumentSnapshot) => {
      const datos = doc.data() as Record<string, unknown>
      return { ...datos, id: doc.id }
    },
  )

  const eventos = await cargarEventos(db, new Set(todos.map((r) => String(r['eventoId'] ?? ''))))

  let filtrados = todos
  if (search) {
    filtrados = filtrados.filter((r) => {
      const evento = eventos.get(String(r['eventoId'] ?? ''))
      return (
        String(r['nombre'] ?? '').toLowerCase().includes(search) ||
        String(r['email'] ?? '').toLowerCase().includes(search) ||
        String(r['dni'] ?? '').includes(search) ||
        String(r['telefono'] ?? '').includes(search) ||
        r.id.toLowerCase().includes(search) ||
        String(evento?.nombre ?? '').toLowerCase().includes(search)
      )
    })
  }
  if (estado) filtrados = filtrados.filter((r) => r['estado'] === estado)
  if (pagoEstado) filtrados = filtrados.filter((r) => (r['pago'] as { estado?: string })?.estado === pagoEstado)

  const total = filtrados.length

  return res.status(200).json({
    ok: true,
    total,
    registros: filtrados.slice(offset, offset + limite).map((r) => {
      const eventoId = String(r['eventoId'] ?? '')
      const evento = eventos.get(eventoId)
      return {
        ...r,
        eventoNombre: evento?.nombre ?? '—',
        organizadorId: evento?.organizadorId ?? '',
        organizadorNombre: evento?.organizadorNombre ?? '',
        fechaRegistro: comoFecha(r['fechaRegistro']),
        fechaUso: comoFecha(r['fechaUso']),
        fechaPago: comoFecha((r['pago'] as { fechaPago?: unknown })?.fechaPago),
      }
    }),
  })
}

/* ------------------------------------------------------------------ */
/* Excepciones comerciales                                             */
/* ------------------------------------------------------------------ */

/**
 * Una "excepción" es un `limitesPersonalizacion` que no coincide con el del
 * plan. No hay colección aparte justamente por eso: el valor vive en el
 * documento del organizador y la regla de creación de eventos lo lee, así
 * que conceder una excepción es un update y no un deploy.
 */
function tieneExcepcion(org: Organizador): boolean {
  const base = LIMITES_POR_PLAN[org.plan]
  const actual = org.limitesPersonalizacion
  return CAMPOS_LIMITE.some((campo) => actual?.[campo] !== base[campo])
}

function camposExcepcionados(org: Organizador): string[] {
  const base = LIMITES_POR_PLAN[org.plan]
  const actual = org.limitesPersonalizacion
  return CAMPOS_LIMITE.filter((campo) => actual?.[campo] !== base[campo])
}

async function rutaExcepciones(
  req: VercelRequest,
  res: VercelResponse,
  db: Firestore,
  admin: AdminAutenticado,
) {
  if (req.method === 'GET') {
    const snapshot = await db.collection('organizadores').get()
    const excepciones = snapshot.docs
      .map((doc: QueryDocumentSnapshot) => ({ ...(doc.data() as Organizador), uid: doc.id }))
      .filter((org: Organizador) => tieneExcepcion(org))
      .map((org: Organizador) => ({
        organizadorId: org.uid,
        organizadorNombre: org.nombre,
        organizadorEmail: org.email,
        plan: org.plan,
        limitesPersonalizacion: org.limitesPersonalizacion,
        campos: camposExcepcionados(org),
      }))

    return res.status(200).json({ ok: true, excepciones })
  }

  if (req.method === 'POST') {
    const { organizadorId, limitesPersonalizacion } = (req.body ?? {}) as {
      organizadorId?: string
      limitesPersonalizacion?: Partial<Limites>
    }
    if (!organizadorId) {
      return res.status(400).json({ ok: false, error: 'Falta el organizador.' })
    }

    const referencia = db.collection('organizadores').doc(organizadorId)
    const actual = await referencia.get()
    if (!actual.exists) {
      return res.status(404).json({ ok: false, error: 'Ese organizador no existe.' })
    }

    const organizador = actual.data() as Organizador
    const base = LIMITES_POR_PLAN[organizador.plan]
    const anterior = organizador.limitesPersonalizacion

    // Se parte de los límites del plan y se pisa sólo lo que vino, para que
    // conceder "capacidad 10.000" no deje el banner en false por olvidarse de
    // mandarlo.
    const merged: Limites = { ...base }
    for (const campo of CAMPOS_LIMITE) {
      const pedido = limitesPersonalizacion?.[campo]
      if (pedido !== undefined) {
        Object.assign(merged, { [campo]: pedido })
      } else if (anterior?.[campo] !== undefined) {
        Object.assign(merged, { [campo]: anterior[campo] })
      }
    }

    if (typeof merged.capacidadMaximaPorEvento !== 'number' || merged.capacidadMaximaPorEvento < 1) {
      return res.status(400).json({ ok: false, error: 'La capacidad máxima debe ser un entero positivo.' })
    }

    await referencia.update({ limitesPersonalizacion: merged })
    await auditar(db, admin, {
      accion: 'conceder-excepcion',
      entidad: 'organizador',
      entidadId: organizadorId,
      detalles: { antes: anterior, despues: merged },
    })

    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const organizadorId = typeof req.query.organizadorId === 'string' ? req.query.organizadorId : ''
    if (!organizadorId) {
      return res.status(400).json({ ok: false, error: 'Falta el organizador.' })
    }

    const referencia = db.collection('organizadores').doc(organizadorId)
    const actual = await referencia.get()
    if (!actual.exists) {
      return res.status(404).json({ ok: false, error: 'Ese organizador no existe.' })
    }

    const plan = (actual.data() as Organizador).plan
    await referencia.update({ limitesPersonalizacion: LIMITES_POR_PLAN[plan] })
    await auditar(db, admin, {
      accion: 'revocar-excepcion',
      entidad: 'organizador',
      entidadId: organizadorId,
      detalles: { restaurado: LIMITES_POR_PLAN[plan] },
    })

    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ ok: false, error: 'Método no permitido' })
}

/* ------------------------------------------------------------------ */
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */

async function rutaAuditoria(req: VercelRequest, res: VercelResponse, db: Firestore) {
  // `accion` ya lo usa el router, así que el filtro viaja con otro nombre.
  const filtroAccion = typeof req.query.filtroAccion === 'string' ? req.query.filtroAccion : ''
  const entidad = typeof req.query.entidad === 'string' ? req.query.entidad : ''
  const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 300)

  let query = db.collection('auditoria').orderBy('creadoEn', 'desc').limit(limite)
  if (entidad) query = query.where('entidad', '==', entidad)

  const snapshot = await query.get()
  let logs: (Record<string, unknown> & { id: string })[] = snapshot.docs.map(
    (doc: QueryDocumentSnapshot) => {
      const datos = doc.data() as Record<string, unknown>
      return { ...datos, id: doc.id }
    },
  )
  if (filtroAccion) logs = logs.filter((log) => log['accion'] === filtroAccion)

  return res.status(200).json({
    ok: true,
    logs: logs.map((log) => ({ ...log, creadoEn: comoFecha(log['creadoEn']) })),
  })
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Lee todos los organizadores una vez y devuelve su ficha por uid. */
async function cargarOrganizadores(db: Firestore): Promise<Map<string, FichaOrganizador>> {
  const snapshot = await db.collection('organizadores').get()
  const mapa = new Map<string, FichaOrganizador>()
  for (const doc of snapshot.docs) {
    const datos = doc.data() as Organizador
    mapa.set(doc.id, { nombre: datos.nombre, email: datos.email, organizadorId: doc.id })
  }
  return mapa
}

interface FichaEvento {
  nombre: string
  organizadorId: string
  organizadorNombre: string
}

/**
 * Ficha de los eventos consultados, con el nombre del organizador resuelto.
 *
 * Se leen los eventos y los organizadores, no uno por evento: unir los
 * nombres con N+1 consultas contra Firestore es la forma más rápida de
 * hacer que un panel global se sienta roto.
 */
async function cargarEventos(db: Firestore, ids: Set<string>): Promise<Map<string, FichaEvento>> {
  const idsValidos = [...ids].filter(Boolean)
  if (idsValidos.length === 0) return new Map()

  const [eventosSnapshot, organizadores] = await Promise.all([
    db.collection('eventos').where(FieldPath.documentId(), 'in', idsValidos.slice(0, 150)).get(),
    cargarOrganizadores(db),
  ])

  const mapa = new Map<string, FichaEvento>()
  for (const doc of eventosSnapshot.docs) {
    const datos = doc.data() as { nombre: string; organizadorId: string }
    const organizadorId = String(datos.organizadorId ?? '')
    mapa.set(doc.id, {
      nombre: datos.nombre,
      organizadorId,
      organizadorNombre: organizadores.get(organizadorId)?.nombre ?? '—',
    })
  }
  return mapa
}