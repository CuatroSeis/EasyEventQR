import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore, Transaction } from 'firebase-admin/firestore'

import { getDb } from '../src/server/lib/firebase-admin.js'
import { evaluarCupo, mensajeDeMotivo, type Contador } from '../src/server/lib/cupo.js'
import { enviarMail } from '../src/server/lib/mail.js'
import { generarToken, hashearToken, imagenQrDe, sha256Hex } from '../src/server/lib/qr.js'
import { ipDelVisitante, resolverBasePublica, urlQrDe } from '../src/server/lib/url.js'
import { esTrampa, validarRegistro } from '../src/server/lib/validacion.js'
import type { Evento, Organizador, Pago, Registro } from '../src/shared/types.js'
import { capturarError } from '../src/server/lib/sentry.js'

/**
 * POST /api/registro — la reserva de una entrada.
 *
 * Orden (cada paso ahorra cuota del plan Spark: 50k lecturas/día):
 *   1. Método (405) · 2. Cuerpo (400) · 3. Honeypot (200 falso) ·
 *   4. Límite por IP (429) · 5. Transacción (409/503) · 6. Mail · 7. 201.
 *
 * El límite va DESPUÉS de validar: dos de sus tres ventanas cuentan
 * envíos de mail, y validar primero evita quemar cuota con formularios
 * mal tipeados. El mail va DESPUÉS de la transacción (red dentro de una
 * transacción = locks holdeados = abortos) y nunca la deshace: un 201
 * que no promete el mail es mejor que un 500 que duplica la reserva.
 */

/** Cuántas veces reintenta Firestore una transacción que se pisa. */
const REINTENTOS_TRANSACCION = 5

/** La colección del limitador. Un documento por IP hasheada. */
const COLECCION_LIMITE = 'rateLimit'

/** Un error con nombre, para distinguir los casos dentro del catch. */
type MotivoDeAlta = 'no-existe' | 'suspendido' | 'cerrado' | 'agotado'

/**
 * Error con nombre propio en vez del texto del mensaje: los mensajes de
 * Firestore cambian entre versiones, y el `switch` del catch queda
 * exhaustivo (un motivo nuevo sin manejar lo dice TypeScript).
 * Sin parameter properties por `erasableSyntaxOnly`.
 */
class ErrorDeAlta extends Error {
  readonly motivo: MotivoDeAlta

  constructor(motivo: MotivoDeAlta) {
    super(motivo)
    this.motivo = motivo
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // La respuesta dice si se guardó la reserva. Cachearla daría un 201 a
  // alguien que no se registró.
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Solo se acepta POST' })
  }

  // -------------------------------------------------------------------
  // 2. El cuerpo
  // -------------------------------------------------------------------
  const validacion = validarRegistro(req.body)
  // `=== false` y no `!validacion.ok`: hay builds (el de Vercel) donde el
  // estrechamiento por variable no ocurre y `problemas` deja de existir.
  if (validacion.ok === false) {
    return res.status(400).json({
      ok: false,
      error: 'Revisá los datos del formulario.',
      problemas: validacion.problemas,
    })
  }
  const alta = validacion.datos

  // -------------------------------------------------------------------
  // 3. La trampa
  // -------------------------------------------------------------------
  //
  // Antes que cualquier acceso a la base, respondiendo IGUAL que un alta
  // exitosa: si devolviera 400, el bot aprende en un intento que el campo
  // invisible lo delató. Y el campo va con `sr-only` + `autoComplete="off"`
  // + `tabIndex={-1}` (no `display: none`) para que el autocompletado del
  // navegador no le regale un "registrado" falso a una persona real.
  if (esTrampa(alta)) {
    // Mismas claves que el 201 de verdad: indistinguible por forma.
    return res.status(201).json({
      ok: true,
      evento: alta.eventoId,
      estado: 'aprobado',
      pagoRequerido: false,
    })
  }

  try {
    const db = getDb()

    // -----------------------------------------------------------------
    // 4. El límite por IP
    // -----------------------------------------------------------------
    const limite = await aplicarLimite(db, req, res)
    if (limite) return limite

    // -----------------------------------------------------------------
    // 5. La transacción
    // -----------------------------------------------------------------
    //
    // El token se genera AFUERA para que el reintento reescriba el mismo:
    // generado adentro, un reintento cambiaría el token y el mail podría
    // ir con uno distinto del guardado.
    const token = generarToken()
    const qrHash = hashearToken(token)
    const base = resolverBasePublica(req.headers, process.env)

    const resultado = await db.runTransaction(
      async (tx: Transaction) => {
        // Lecturas antes que escrituras (lo exige Firestore) y de la
        // misma foto: los dos documentos se leen juntos.
        const refEvento = db.collection('eventos').doc(alta.eventoId)
        const snapEvento = await tx.get(refEvento)
        if (!snapEvento.exists) throw new ErrorDeAlta('no-existe')
        const evento = snapEvento.data() as Evento

        if (evento.estado !== 'activo') throw new ErrorDeAlta('cerrado')

        // El organizador sale del evento, nunca del cuerpo: ningún input
        // del cliente puede apuntar a otro. (`tx` no tiene `.collection()`.)
        const snapOrganizador = await tx.get(
          db.collection('organizadores').doc(evento.organizadorId),
        )
        if (!snapOrganizador.exists) throw new ErrorDeAlta('suspendido')
        if ((snapOrganizador.data() as Organizador).estadoSuscripcion !== 'activo') {
          throw new ErrorDeAlta('suspendido')
        }

        // El cupo, contra el contador del servidor. `?? 0` por los
        // eventos pre-Fase 3 sin el campo (NaN dejaría pasar a todos).
        const reservas = Number(evento.reservas ?? 0)
        if (!(reservas < evento.capacidadMaxima)) throw new ErrorDeAlta('agotado')

        const pago: Pago = evento.requierePago
          ? {
              requerido: true,
              estado: 'pendiente',
              montoPagado: null,
              medioPago: null,
              idTransaccion: null,
              fechaPago: null,
            }
          : {
              requerido: false,
              estado: 'no_aplica',
              montoPagado: null,
              medioPago: null,
              idTransaccion: null,
              fechaPago: null,
            }

        // Dos desviaciones del tipo `Registro`, y las dos a propósito:
        //
        //   `fechaRegistro` es un sentinel del servidor, no un `Date`. El
        //   reloj de la lambda puede andar desviado y un `new Date()`
        //   dejaría reservas con la fecha corrida. Cuando se lee, el
        //   Timestamp vuelve a ser un Date, así que para el resto del
        //   proyecto el modelo no cambia.
        //
        //   `ipHash` no está en la interfaz: es un dato de la operación,
        //   no del asistente. Se escribe igual, y sumarlo al tipo deja
        //   claro que existe y por qué.
        const registro: Omit<Registro, 'fechaRegistro'> & {
          fechaRegistro: FieldValue
          ipHash: string
        } = {
          eventoId: alta.eventoId,
          nombre: alta.nombre,
          email: alta.email,
          telefono: alta.telefono,
          dni: alta.dni,
          fechaNacimiento: alta.fechaNacimiento,
          // El token en claro NO se guarda. Sólo su huella, que además
          // es el nombre del documento: la validación es un `getDoc` y no
          // puede haber dos documentos con la misma huella.
          qrHash,
          estado: evento.requierePago ? 'pendiente' : 'aprobado',
          pago,
          usado: false,
          fechaRegistro: FieldValue.serverTimestamp(),
          fechaUso: null,
          // La IP hasheada, para la Fase 6. No en crudo: con el hash se
          // puede contar "cuántas entradas salieron de la misma conexión"
          // y con la IP se podría seguir a la persona.
          ipHash: sha256Hex(ipDelVisitante(req.headers) ?? 'desconocida'),
        }

        // `create` y no `set`: si la huella ya existe (colisión, o un
        // reintento mal hecho) Firestore falla en vez de pisar una
        // entrada ajena. Cuesta lo mismo y no se puede equivocar.
        await tx.create(db.collection('registros').doc(qrHash), registro)

        // El contador se escribe en la MISMA transacción que la reserva.
        // Es el punto de toda la operación: si se escribieran por
        // separado, dos personas que se registran en el mismo instante
        // leerían el mismo `reservas` y las dos entrarían aunque quedara
        // un solo lugar.
        await tx.set(refEvento, { reservas: reservas + 1 }, { merge: true })

        return { evento, pago, estado: registro.estado }
      },
      { maxAttempts: REINTENTOS_TRANSACCION },
    )

    // -----------------------------------------------------------------
    // 6. El mail, ya con la reserva confirmada
    // -----------------------------------------------------------------
    //
    // Fuera de la transacción: red adentro = locks holdeados = abortos.
    // El `eventoId` va en la URL para que la validación exija ESTE evento.
    const urlQr = urlQrDe(token, base, alta.eventoId)
    try {
      const imagenQr = await imagenQrDe(urlQr)
      await enviarMail({
        destinatario: alta.email,
        nombreAsistente: alta.nombre,
        urlQr,
        imagenQr,
        evento: {
          eventoId: alta.eventoId,
          nombre: resultado.evento.nombre,
          fechaIso: aIso(resultado.evento.fecha),
          lugar: resultado.evento.lugar,
          textoConfirmacion: resultado.evento.personalizacion?.textoConfirmacion ?? null,
          colorPrimario: resultado.evento.personalizacion?.colorPrimario ?? null,
        },
      })
    } catch (error) {
      // Red de seguridad por si algo escapa de `enviarMail` (que no tira):
      // la reserva NO se pierde y el log deja rastro.
      await capturarError(error, { ruta: '[registro] falló el envío, la reserva quedó guardada:' })
    }

    // -----------------------------------------------------------------
    // 7. La respuesta
    // -----------------------------------------------------------------
    //
    // Sin token ni email: un proxy o un log con la respuesta no puede
    // convertirse en una entrada válida.
    return res.status(201).json({
      ok: true,
      evento: resultado.evento.nombre,
      estado: resultado.estado,
      pagoRequerido: resultado.pago.requerido,
      registroId: qrHash,
    })
  } catch (error) {
    return responderConError(error, res)
  }
}

/**
 * El límite por IP: leer, decidir, y escribir sólo si tiene que.
 *
 * El documento es `/rateLimit/{sha256 de la IP}` (un dump no expone IPs).
 * Sin IP detectable se usa 'desconocida' y todos comparten contador: sin
 * IP no hay forma de distinguirlos.
 */
async function aplicarLimite(
  db: Firestore,
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse | null> {
  const ip = ipDelVisitante(req.headers) ?? 'desconocida'
  const ref = db.collection(COLECCION_LIMITE).doc(sha256Hex(ip))
  const ahora = Date.now()

  // Lectura primero, siempre. Es la que decide.
  const snap = await ref.get()
  const actual = snap.exists ? (snap.data() as Contador) : null
  const decision = evaluarCupo(actual, ahora)

  if (!decision.permitido) {
    // 429 con Retry-After. `escribir: false` evita el costo, y el 429 no
    // dice en qué ventana cayó (`mensajeDeMotivo` unifica los textos).
    const espera = decision.motivo === 'pedidos' ? 60 : 900
    res.setHeader('Retry-After', String(espera))
    return res.status(429).json({ ok: false, error: mensajeDeMotivo(decision.motivo) })
  }

  // Sólo se escribe cuando la request pasó: un rechazo no gasta
  // escritura, o el propio limitador fundiría la cuota bajo ataque.
  await ref.set(decision.siguiente, { merge: true })
  return null
}

/**
 * Traduce los errores de la transacción a respuestas HTTP.
 *
 * 409 lleno (leer y no reintentar) vs 503 contención (reintentable): en
 * el mismo sobre, un evento lleno se vería como error del servidor.
 */
function responderConError(error: unknown, res: VercelResponse) {
  if (error instanceof ErrorDeAlta) {
    switch (error.motivo) {
      case 'agotado':
        return res.status(409).json({ ok: false, error: 'Se agotaron los lugares de este evento.' })
      case 'cerrado':
        return res.status(409).json({ ok: false, error: 'Este evento ya no acepta reservas.' })
      // Inexistente y suspendido dan el mismo 404: confirmar que existe
      // sería filtrar (ver api/evento-publico.ts).
      case 'no-existe':
      case 'suspendido':
        return res.status(404).json({
          ok: false,
          error: 'Ese evento no existe o ya no está disponible.',
        })
    }
  }

  // 10 ABORTED y 4 DEADLINE_EXCEEDED: reintentables. 6 ALREADY_EXISTS:
  // el `tx.create` chocó una huella (192 bits: casi imposible) y con un
  // token nuevo se resuelve: 503, no 500.
  const codigo = (error as { code?: number | string } | null)?.code
  if (codigo === 10 || codigo === 4 || codigo === 14 || codigo === 6) {
    return res.status(503).json({
      ok: false,
      error: 'Hubo mucho movimiento. Reintentá en un segundo.',
    })
  }

  void capturarError(error, { ruta: 'registro' })
  return res.status(500).json({ ok: false, error: 'No pudimos completar la reserva.' })
}

/** Un Timestamp, un Date o un ISO, siempre ISO. */
function aIso(valor: unknown): string {
  const conToDate = valor as { toDate?: () => Date } | null | undefined
  if (conToDate && typeof conToDate.toDate === 'function') return conToDate.toDate().toISOString()
  if (valor instanceof Date) return valor.toISOString()
  const parseada = new Date(String(valor))
  return Number.isNaN(parseada.getTime()) ? '' : parseada.toISOString()
}
