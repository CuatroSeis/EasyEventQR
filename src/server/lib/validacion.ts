/**
 * Validación del alta de una reserva, del lado del servidor.
 *
 * MÓDULO HOJA A PROPÓSITO: ver el comentario de api/lib/qr.ts sobre por
 * qué los módulos de api/lib/ no se importan entre sí.
 *
 * POR QUÉ NO HAY UN `zod` EN EL LADO DEL NAVEGADOR, duplicando este
 * esquema para el formulario de /e/:eventoId:
 *
 * Serían dos copias de las mismas reglas, y este proyecto ya pagó por
 * esa clase de bug: `LIMITES_POR_PLAN` está en TypeScript Y replicado a
 * mano en firestore.rules, y lo único que los mantiene vivos es un test
 * que compara los dos. El formulario público usa validación nativa de
 * HTML5 (`required`, `type="email"`, `minlength`), que da el mismo
 * "poné tu nombre" al instante sin viajar, y el servidor manda. La UI es
 * UX; el contrato es esta función.
 */

import { z } from 'zod'

/**
 * Lo que el navegador manda a POST /api/registro.
 *
 * `sitioWeb` es la trampa. Es un campo invisible que un humano no ve y
 * nunca llena, y un bot que completa formularios automáticamente lo
 * llena sin pensar. No tiene ninguna regla de validación a propósito:
 * llenarlo NO es un error de validación, hay que responder 200 con la
 * forma normal de siempre para que el bot no pueda deducir que lo
 * detectaron. Por eso vive en el esquema pero lo mira `esTrampa()`.
 */
export const EsquemaRegistro = z.object({
  eventoId: z
    .string()
    .trim()
    .min(1, 'Falta el evento.')
    .max(128, 'El evento no existe.')
    .regex(/^[A-Za-z0-9_-]+$/, 'El evento no existe.'),
  nombre: z
    .string()
    .trim()
    .min(2, 'Poné tu nombre.')
    .max(80, 'El nombre es demasiado largo.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Revisá el correo.').max(254, 'El correo es demasiado largo.')),
  telefono: z
    .string()
    .trim()
    .max(32, 'El teléfono es demasiado largo.')
    .optional()
    .default(''),
  dni: z
    .string()
    .trim()
    .regex(/^\d{7,8}$/, 'El DNI debe tener 7 u 8 dígitos numéricos.'),
  fechaNacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de nacimiento no es válida.'),
  sitioWeb: z.string().max(200).optional().default(''),
})

/** El cuerpo ya validado y normalizado. */
export interface BorradorRegistro {
  eventoId: string
  nombre: string
  email: string
  telefono: string
  dni: string
  fechaNacimiento: string
  sitioWeb: string
}

export interface Problema {
  campo: string
  mensaje: string
}

export type ResultadoValidacion =
  | { ok: true; datos: BorradorRegistro }
  | { ok: false; problemas: Problema[] }

/**
 * Valida y normaliza el cuerpo del POST.
 *
 * `cuerpo` llega como `unknown` a propósito: el body de una request es
 * cualquier cosa que mande el otro lado, y el que decide si es un
 * objeto con la forma esperada es el parser, no el tipado.
 *
 * La normalización a minúsculas del correo no es cosmetismo: es lo que
 * hace que "Juan@Mail.com" y "juan@mail.com" sean la misma persona para
 * cualquier deduplicación o chequeo futuro. Hoy no hay deduplicación,
 * pero el día que la haya, un correo sin normalizar la esquiva
 * escribiendo con mayúscula y minúscula.
 */
export function validarRegistro(cuerpo: unknown): ResultadoValidacion {
  const resultado = EsquemaRegistro.safeParse(cuerpo)
  if (!resultado.success) {
    return {
      ok: false,
      problemas: resultado.error.issues.map((issue) => ({
        campo: issue.path.join('.') || 'general',
        mensaje: issue.message,
      })),
    }
  }

  const { eventoId, nombre, email, telefono, dni, fechaNacimiento, sitioWeb } = resultado.data

  // Validar mayor de edad (18 años)
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mesDiff = hoy.getMonth() - nacimiento.getMonth()
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--
  }
  if (edad < 18) {
    return {
      ok: false,
      problemas: [{ campo: 'fechaNacimiento', mensaje: 'El evento es solo para mayores de 18 años.' }],
    }
  }

  return {
    ok: true,
    datos: {
      eventoId,
      nombre,
      email: email.trim().toLowerCase(),
      telefono,
      dni,
      fechaNacimiento,
      sitioWeb,
    },
  }
}

/**
 * ¿El bot llenó el campo trampa?
 *
 * Se mira `sitioWeb` YA NORMALIZADO con `.trim()`, porque un bot que
 * manda un espacio adentro del campo invisible tiene que caer igual: si
 * no, mandar `" "` esquivaría la trampa con el mismo costo que mandar
 * una url.
 *
 * Y la comparación es de longitud, no de contenido: no importa qué haya
 * puesto, importa que haya puesto algo.
 */
export function esTrampa(borrador: Pick<BorradorRegistro, 'sitioWeb'>): boolean {
  return borrador.sitioWeb.trim().length > 0
}
