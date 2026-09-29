import type { VercelRequest, VercelResponse } from '@vercel/node'
import { FieldValue } from 'firebase-admin/firestore'

import type { Firestore } from 'firebase-admin/firestore'

import { getDb } from './lib/firebase-admin.js'
import { evaluarCupo, mensajeDeMotivo, type Contador } from './lib/cupo.js'
import { enviarMail } from './lib/mail.js'
import { generarToken, hashearToken, imagenQrDe, sha256Hex } from './lib/qr.js'
import { ipDelVisitante, resolverBasePublica, urlQrDe } from './lib/url.js'
import { esTrampa, validarRegistro } from './lib/validacion.js'
import type { Evento, Organizador, Pago, Registro } from '../src/shared/types.js'

/**
 * POST /api/registro — la reserva de una entrada.
 *
 * Este es el endpoint más importante de la fase. Todo lo demás (la
 * landing, el mail, la validación) es consequence de que este funcione.
 *
 * EL ORDEN DE LAS OPERACIONES, Y POR QUÉ ES ESTE
 *
 *   1. Método.              405
 *   2. Validar el cuerpo.   400
 *   3. Trampa (honeypot).    200 falso
 *   4. Límite por IP.        429
 *   5. Transacción.          409 / 503
 *   6. Mandar el mail.       201 igual
 *   7. Responder.            201
 *
 * Los tres primeros van antes de tocar Firestore, a propósito. Una
 * request con el cuerpo roto o con la trampa llena no lee ni escribe NADA
 * en la base, y en el plan Spark las lecturas son 2,5 veces más caras que
 * las escrituras (50.000 contra 20.000 por día). Que un bot pueda gastar
 * cuota de lectura sin límite es justo lo que este orden evita.
 *
 * El límite por IP va después de validar y no antes, por una razón que
 * parece contraintuitiva: el contador del limitador lleva tres ventanas
 * junta, y dos de ellas cuentan ENVÍOS de mail. Si el límite corriera
 * antes de validar, diez formularios con un error de tipeo gastarían diez
 * de los diez envíos por hora de esa IP, y a la gente real de esa misma
 * conexión le diríamos "ya enviamos suficientes entradas" sin haber
 * enviado ninguna. A un bot que manda cuerpos mal formados no lo frenamos
 * con esto, pero tampoco le estamos dando nada: no llega a la base.
 *
 * EL MAIL VA DESPUÉS DE LA TRANSACCIÓN Y NUNCA LA DESHACE
 *
 * No se puede meter un `fetch` a Brevo adentro de una transacción de
 * Firestore: la transacción tiene un tiempo máximo de vida, y mientras
 * espera a la red mantiene los documentos del evento bloqueados, con lo
 * que cualquier otra persona que se esté registrando al mismo tiempo ve
 * su transacción abortada y reintentada.
 *
 * El orden inverso tiene el problema de que un fallo del mail deja la
 * reserva escrita y una respuesta de error, y el usuario reintenta: dos
 * reservas y dos mails por la misma persona. Ver la nota de
 * `api/lib/mail.ts` sobre por qué se responde 201 aunque el mail no salga.
 */

/** Cuántas veces reintenta Firestore una transacción que se pisa. */
const REINTENTOS_TRANSACCION = 5

/** La colección del limitador. Un documento por IP hasheada. */
const COLECCION_LIMITE = 'rateLimit'

/** Un error con nombre, para distinguir los casos dentro del catch. */
type MotivoDeAlta = 'no-existe' | 'suspendido' | 'cerrado' | 'agotado'

/**
 * Un error con nombre propio, para no usar el texto del mensaje como
 * bandera.
 *
 * Los mensajes de Firestore cambian entre versiones y están en inglés, así
 * que compararlos con `includes` es una bomba de tiempo. Con este tipo, el
 * `switch` del catch es exhaustivo: si mañana se agrega un motivo nuevo y
 * no se maneja, TypeScript lo dice.
 *
 * Se escribe a mano y no con `constructor(readonly motivo)` porque el
 * proyecto compila con `erasableSyntaxOnly`: las parameter properties son
 * sintaxis de TypeScript que desaparece al compilar, y acá no se puede.
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
  if (!validacion.ok) {
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
  // Antes que cualquier acceso a la base, y con la respuesta 200 más
  // común que se puede devolver: la misma forma y el mismo texto que un
  // alta exitoso. Si se devolviera 400, un bot que completa formularios
  // automáticamente aprende en un intento que el campo invisible lo delató
  // y al siguiente lo deja vacío. Por eso se responde IGUAL que un alta
  // exitoso y no se escribe nada: el bot no tiene forma de saber qué
  // pasó, y para cuando lo descubre ya gastó CPU y no cuota.
  //
  // EL RIESGO REAL DE ESTA TRAMPA NO ES EL BOT, ES EL AUTOCOMPLETADO.
  // Un navegador que autocompleta un campo escondido le devuelve un
  // "registrado" a una persona que nunca se registró y que no va a recibir
  // ningún mail. Por eso el campo del formulario va con `sr-only` y no con
  // `display: none` (que algunos navegadores ni autocompletan), con
  // `autoComplete="off"` y con `tabIndex={-1}`: las tres cosas juntas son
  // la diferencia entre una trampa para bots y una trampa para gente.
  if (esTrampa(alta)) {
    // Las mismas claves que el 201 de verdad, para que un bot no pueda
    // distinguir los dos casos por la forma de la respuesta.
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
    // El token se genera ANTES y se pasa adentro. Es lo que hace que la
    // transacción sea reintentable sin cambiar el resultado: si el
    // conflicto se resolviera adentro, un reintento generaría un token
    // nuevo y el mail podría ir con un token distinto del que quedó
    // guardado. Generado afuera, el reintento reescribe el mismo.
    const token = generarToken()
    const qrHash = hashearToken(token)
    const base = resolverBasePublica(req.headers, process.env)

    const resultado = await db.runTransaction(
      async (tx) => {
        // Todas las lecturas ANTES de cualquier escritura. Firestore
        // exige ese orden, y además es lo correcto: los dos documentos
        // que se leen tienen que ser de la misma foto.
        const refEvento = db.collection('eventos').doc(alta.eventoId)
        const snapEvento = await tx.get(refEvento)
        if (!snapEvento.exists) throw new ErrorDeAlta('no-existe')
        const evento = snapEvento.data() as Evento

        if (evento.estado !== 'activo') throw new ErrorDeAlta('cerrado')

        // El organizador sale del evento, no del cuerpo de la request: no
        // hay ningún input del cliente que pueda apuntar a otro.
        // `tx` no tiene `.collection()`: las referencias salen de `db` y
        // se le pasan a la transacción.
        const snapOrganizador = await tx.get(
          db.collection('organizadores').doc(evento.organizadorId),
        )
        if (!snapOrganizador.exists) throw new ErrorDeAlta('suspendido')
        if ((snapOrganizador.data() as Organizador).estadoSuscripcion !== 'activo') {
          throw new ErrorDeAlta('suspendido')
        }

        // El cupo, contra el contador del servidor. `?? 0` porque los
        // eventos creados antes de la Fase 3 no tienen el campo, y sin
        // esto un evento viejo daría NaN y la comparación 'NaN >= N' da
        // false: dejaría pasar a todo el mundo.
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
    // Fuera de la transacción, a propósito. `enviarMail` no tira nunca: si
    // Brevo está caído, el log dice por qué y la reserva sigue adelante.
    // El `eventoId` va en la URL del QR para que la validación exija que
    // la reserva sea de ESTE evento, y no de cualquiera.
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
      // Esta es la red de seguridad de `enviarMail`, que ya no tira. Si
      // algo se escapa de adentro (por ejemplo, que `qrcode` no esté
      // instalado), la reserva NO se pierde y el log deja rastro.
      console.error('[registro] falló el envío, la reserva quedó guardada:', error)
    }

    // -----------------------------------------------------------------
    // 7. La respuesta
    // -----------------------------------------------------------------
    //
    // NO va el token. Si fuera, cualquiera que intercepte la respuesta
    // (un proxy, el wifi del local, un log de Vercel) tendría una entrada
    // válida, y el token dejaría de ser un secreto que sólo conoce su
    // dueño. Tampoco va el email: la respuesta no necesita repetir lo que
    // el cliente ya sabe.
    return res.status(201).json({
      ok: true,
      evento: resultado.evento.nombre,
      estado: resultado.estado,
      pagoRequerido: resultado.pago.requerido,
    })
  } catch (error) {
    return responderConError(error, res)
  }
}

/**
 * El límite por IP: leer, decidir, y escribir sólo si tiene que.
 *
 * El documento es `/rateLimit/{sha256 de la IP}`. El hash está para que
 * un dump de la colección no sea una lista de direcciones IP de gente que
 * se anotó a un taller, y para que el ID sea siempre válido.
 *
 * Si la IP no se puede determinar se usa la constante 'desconocida': todos
 * los que no la tienen comparten el mismo contador. Suena injusto pero es
 * lo correcto: sin IP no hay forma de distinguirlos, y repartir el límite
 * entre ellos sería inventarse un límite que no existe.
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
    // 429 con Retry-After. El `escribir: false` de la decisión evita el
    // costo, y el 429 no dice en qué ventana se cayó: `mensajeDeMotivo`
    // devuelve el mismo texto para los dos límites de envío.
    const espera = decision.motivo === 'pedidos' ? 60 : 900
    res.setHeader('Retry-After', String(espera))
    return res.status(429).json({ ok: false, error: mensajeDeMotivo(decision.motivo) })
  }

  // Sólo se escribe cuando la request pasó. Un request ya rechazado no
  // gasta una escritura, que es lo que evita que el propio limitador
  // consuma la cuota de escrituras de Firestore cuando lo atacan.
  await ref.set(decision.siguiente, { merge: true })
  return null
}

/**
 * Traduce los errores de la transacción a respuestas HTTP.
 *
 * La distinción importante es la de fondo: un evento lleno es un 409 que
 * el usuario tiene que leer ("no quedan lugares"), y una contención es un
 * 503 que puede reintentarse solo ("reintentá en un segundo"). Meterlas en
 * el mismo sobre es lo que hace que un evento lleno se vea como un error
 * del servidor y que la gente reintente sin parar.
 */
function responderConError(error: unknown, res: VercelResponse) {
  if (error instanceof ErrorDeAlta) {
    switch (error.motivo) {
      case 'agotado':
        return res.status(409).json({ ok: false, error: 'Se agotaron los lugares de este evento.' })
      case 'cerrado':
        return res.status(409).json({ ok: false, error: 'Este evento ya no acepta reservas.' })
      // Un evento inexistente y un organizador suspendido dan el mismo
      // 404 y el mismo texto, por lo mismo que en api/evento-publico.ts:
      // confirmar que existe sería filtrar.
      case 'no-existe':
      case 'suspendido':
        return res.status(404).json({
          ok: false,
          error: 'Ese evento no existe o ya no está disponible.',
        })
    }
  }

  // Los códigos de Firestore que valen la pena tratar distinto. 10 es
  // ABORTED (alguien escribió el evento mientras transactábamos) y 4 es
  // DEADLINE_EXCEEDED: los dos son reintentables, y después de 5 intentos
  // no queda otra cosa que hacer que decirle al usuario que reintente.
  // 6 es ALREADY_EXISTS: el `tx.create` del registro encontró una huella
  // que ya estaba. Con 192 bits de token es bien improbable, pero si
  // pasara, reintentar con un token nuevo lo resuelve, así que es un 503
  // y no un 500.
  const codigo = (error as { code?: number | string } | null)?.code
  if (codigo === 10 || codigo === 4 || codigo === 14 || codigo === 6) {
    return res.status(503).json({
      ok: false,
      error: 'Hubo mucho movimiento. Reintentá en un segundo.',
    })
  }

  console.error('[registro] error inesperado:', error)
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
