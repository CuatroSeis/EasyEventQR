import { Timestamp, type Firestore } from 'firebase-admin/firestore'

import { generarToken, hashearToken, imagenQrDe } from './qr.js'
import { enviarMail } from './mail.js'
import { urlQrDe } from './url.js'
import type { EntradaDelMail } from './email.js'
import type { Evento, Registro } from '../../shared/types.js'

/**
 * Rotación de token con el QR nuevo por mail.
 *
 * El token en claro no se guarda en ningún lado (sólo su SHA-256, que
 * ADEMÁS es el ID del documento: la validación es un `get`, no una
 * query). Por eso rotar significa: generar un token nuevo, mandar el
 * mail con su QR, y recién después crear el documento nuevo y borrar el
 * viejo. El orden importa en las dos direcciones:
 *
 * - Mail primero: si el envío falla, el QR anterior tiene que seguir
 *   sirviendo. Rotar antes dejaba al asistente sin ninguna entrada
 *   válida (la vieja muerta, la nueva nunca enviada).
 * - Crear + borrar en transacción: si el proceso muere en el medio, o
 *   quedan los dos documentos (dos QR válidos) o ninguno (ver abajo).
 *
 * En vez de borrar, el documento viejo queda como lápida con
 * `reemplazadoPor`: el que escanee el QR viejo recibe "fue reemplazado"
 * en vez de "no existe", y `/api/pagos/estado` puede seguir el puntero
 * para la pantalla de pago confirmado.
 */

export interface DatosRotacion {
  registroId: string
  eventoId: string
  evento: Evento
  base: string
}

/** Timestamp de Firestore, Date o ISO: siempre ISO, nunca tira. */
function aIso(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString()
  const conToDate = valor as { toDate?: () => Date } | null | undefined
  if (conToDate && typeof conToDate.toDate === 'function') {
    return conToDate.toDate().toISOString()
  }
  const parseada = new Date(String(valor))
  return Number.isNaN(parseada.getTime()) ? '' : parseada.toISOString()
}

export async function rotarToken(
  db: Firestore,
  datos: DatosRotacion,
): Promise<{ ok: true; nuevoId: string } | { ok: false; motivo: string }> {
  const refViejo = db.collection('registros').doc(datos.registroId)
  const snapViejo = await refViejo.get()
  if (!snapViejo.exists) return { ok: false, motivo: 'no-existe' }

  const registro = snapViejo.data() as Registro
  if (registro.eventoId !== datos.eventoId) return { ok: false, motivo: 'ajeno' }
  if (registro.reemplazadoPor) return { ok: false, motivo: 'ya-rotado' }

  const token = generarToken()
  const hashNuevo = hashearToken(token)

  // Un choque de hash sobre otro registro no se pisa: 192 bits lo hacen
  // casi imposible, pero mirar cuesta una lectura y no mirar puede
  // corromper el QR de otro invitado.
  const snapChoque = await db.collection('registros').doc(hashNuevo).get()
  if (snapChoque.exists && snapChoque.id !== snapViejo.id) {
    return { ok: false, motivo: 'choque' }
  }

  const urlQr = urlQrDe(token, datos.base, datos.eventoId)
  const imagenQr = await imagenQrDe(urlQr)

  const entrada: EntradaDelMail = {
    destinatario: registro.email,
    nombreAsistente: registro.nombre,
    urlQr,
    imagenQr,
    evento: {
      eventoId: datos.eventoId,
      nombre: datos.evento.nombre,
      fechaIso: aIso(datos.evento.fecha),
      lugar: datos.evento.lugar,
      textoConfirmacion: datos.evento.personalizacion?.textoConfirmacion ?? null,
      colorPrimario: datos.evento.personalizacion?.colorPrimario ?? null,
    },
  }

  const resultado = await enviarMail(entrada)
  if (!resultado.enviado) return { ok: false, motivo: 'mail' }

  const nuevo: Registro & { ipHash?: string } = {
    ...(registro as Registro),
    qrHash: hashNuevo,
    tokenEmitidoEn: Timestamp.now() as unknown as Date,
  }
  delete (nuevo as Partial<Registro>).reemplazadoPor

  await db.runTransaction(async (tx) => {
    // Todas las lecturas primero: el Firestore real revienta la
    // transacción si un `get` corre después de un write (500 en
    // producción que el emulador no reproduce).
    const snapConfirma = await tx.get(refViejo)
    if (!snapConfirma.exists) throw new Error('ROTACION_SIN_ORIGEN')
    tx.create(db.collection('registros').doc(hashNuevo), { ...nuevo })
    tx.set(refViejo, { reemplazadoPor: hashNuevo })
  })

  return { ok: true, nuevoId: hashNuevo }
}
