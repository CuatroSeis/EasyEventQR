import { readFile } from 'node:fs/promises'
import { doc, setDoc } from 'firebase/firestore'
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'

import { nuevoDocumentoOrganizador } from '../../src/services/organizadores.ts'
import { nuevoDocumentoEvento } from '../../src/services/documentoEvento.ts'
import type { PersonalizacionEvento } from '../../src/shared/types.ts'

// El projectId tiene que coincidir con el que arranca el emulador
// (emulators:exec --project easyeventqr-dev). El emulador no se
// conecta al proyecto real: es un proceso local con su propio
// almacenamiento en memoria.
export const PROYECTO = 'easyeventqr-dev'

export const ORG_A = 'uid-organizador-a'
export const ORG_B = 'uid-organizador-b'
export const ORG_C = 'uid-organizador-c'
export const UID_ADMIN = 'uid-super-admin'

export const EVENTO_A = 'evento-de-a'
export const EVENTO_B = 'evento-de-b'
export const REGISTRO_A = 'registro-de-a'
export const REGISTRO_B = 'registro-de-b'

const FECHAS = {
  fechaAlta: '2026-01-01T00:00:00.000Z',
  fecha: '2026-06-01T20:00:00.000Z',
  fechaRegistro: '2026-05-01T10:00:00.000Z',
  fechaUso: null,
}

let entorno: RulesTestEnvironment | undefined

export async function arrancarEntorno(): Promise<RulesTestEnvironment> {
  if (entorno) return entorno

  const reglas = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8')

  entorno = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: {
      rules: reglas,
      host: '127.0.0.1',
      port: 8080,
    },
  })

  return entorno
}

export async function apagarEntorno(): Promise<void> {
  if (entorno) {
    await entorno.cleanup()
    entorno = undefined
  }
}

export interface DatosOrganizador {
  [clave: string]: unknown
}

/** Espejo de la interfaz `Organizador` de src/shared/types.ts.
 *
 *  Arranca del constructor real de la app (nuevoDocumentoOrganizador)
 *  y le pisa lo que el test necesite. Así la siembra no puede quedar
 *  desfasada del payload que la app manda de verdad. */
export function datosOrganizador(
  uid: string,
  email: string,
  extra: DatosOrganizador = {},
): DatosOrganizador {
  return {
    ...nuevoDocumentoOrganizador(uid, email, `Organizador ${uid}`),
    fechaAlta: FECHAS.fechaAlta,
    ...extra,
  }
}

/** Espejo de la interfaz `Evento`.
 *
 *  Arranca del constructor real de la app (nuevoDocumentoEvento) y le
 *  pisa lo que el test necesite, igual que datosOrganizador con
 *  nuevoDocumentoOrganizador. La razón es la misma: si el documento que
 *  la app manda y el que la regla espera son dos copias escritas a mano,
 *  no hay forma de que nadie note cuándo dejan de coincidir.
 *
 *  `extra` existe para los tests de la Fase 3, que necesitan sembrar un
 *  evento con `reservas` distinto de 0 o con un `personalizacion` que el
 *  plan no permite, y después comprobar que la regla lo rechaza. */
export function datosEvento(
  organizadorId: string,
  nombre: string,
  extra: DatosOrganizador = {},
): DatosOrganizador {
  return {
    ...nuevoDocumentoEvento(organizadorId, {
      nombre,
      fecha: new Date(FECHAS.fecha),
      lugar: 'Salón de ejemplo',
      descripcion: 'Evento de prueba',
      // Justo en el límite del plan gratis, a propósito: la regla acepta
      // <=, y tests/rules/limites.test.ts tiene el test de borde de que
      // 100 con un tope de 100 tiene que pasar. Si este valor subiera
      // por encima del límite, todos los tests de aislamiento empezarían a fallar
      // con un error que no señalaría la causa.
      capacidadMaxima: 100,
      requierePago: false,
      precioEntrada: null,
      bannerUrl: null,
      visibilidad: 'privado',
      categoria: null,
    }),
    ...extra,
  }
}

/**
 * Devuelve el evento con `personalizacion` alterada en algunos campos.
 *
 * Los tests de la Fase 3 necesitan sembrar eventos CON banner, CON logo o
 * con color, y escribirlos a mano sería una segunda copia de la forma de
 * `PersonalizacionEvento` que queda vieja en silencio. Esto parte del
 * objeto que devuelve el constructor real y pisa sólo lo que el test
 * quiere, que es lo mismo que hace `extra` con el resto del documento.
 */
export function conPersonalizacion(
  evento: DatosOrganizador,
  cambios: Partial<PersonalizacionEvento>,
): DatosOrganizador {
  const base = evento.personalizacion as PersonalizacionEvento
  return { ...evento, personalizacion: { ...base, ...cambios } }
}

/**
 * El objeto `personalizacion` completo, con algunos campos cambiados.
 *
 * Existe aparte de `conPersonalizacion` porque `updateDoc` NO mergea en
 * profundidad: manda `{personalizacion:{logoUrl:'…'}}` REEMPLAZA el mapa
 * entero, y los otros cinco campos desaparecen. Un update de la
 * personalización tiene que mandar el objeto completo, que es lo que va a
 * hacer `actualizarEvento` en la app.
 */
export function personalizacionDe(cambios: Partial<PersonalizacionEvento> = {}): PersonalizacionEvento {
  return { ...(datosEvento('uid-cualquiera', 'Evento').personalizacion as PersonalizacionEvento), ...cambios }
}

/**
 * Espejo de la interfaz `Registro`. OJO con `usado`: no existe ningún
 * campo `organizadorId` acá a propósito. Un atacante no podría
 * auto-asignar un registro escribiéndolo, porque el create está
 * cerrado; pero si algún día se abriera, el campo que hace de
 * armadura es que la propiedad se resuelve saltando al evento.
 *
 * El parámetro es `qrHash` y no `qrCode`: en Firestore no está el token
 * del QR, sólo su SHA-256. El token en claro sale una sola vez por mail.
 */
export function datosRegistro(eventoId: string, qrHash: string): DatosOrganizador {
  return {
    eventoId,
    nombre: 'Invitado de prueba',
    email: 'invitado@ejemplo.com',
    telefono: '+5491100000000',
    qrHash,
    estado: 'aprobado',
    pago: {
      requerido: false,
      estado: 'no_aplica',
      montoPagado: null,
      medioPago: null,
      idTransaccion: null,
      fechaPago: null,
    },
    usado: false,
    fechaRegistro: FECHAS.fechaRegistro,
    fechaUso: FECHAS.fechaUso,
  }
}

/**
 * Siembra la base del aislamiento: dos organizadores, un evento y un
 * registro cada uno. Se escribe con las reglas DESHABILITADAS, que es
 * el equivalente a los datos que ya estaban en la base real: el
 * emulador no puede simular "datos que otro usuario escribió", así
 * que la siembra tiene que saltarse las reglas a propósito.
 */
export async function sembrarBase(ctx: RulesTestContext): Promise<void> {
  // Sin anotar el tipo a propósito: el objeto que devuelve
  // RulesTestContext.firestore() viene de una versión distinta del SDK
  // cliente que importa el resto del proyecto, y la structurally-typed
  // intersección de las dos no compila. El tipo se infiere y listo,
  // setDoc/doc aceptan el mismo objeto.
  const db = ctx.firestore()

  await setDoc(doc(db, 'organizadores', ORG_A), datosOrganizador(ORG_A, 'a@evento.com'))
  await setDoc(doc(db, 'organizadores', ORG_B), datosOrganizador(ORG_B, 'b@evento.com'))

  await setDoc(doc(db, 'eventos', EVENTO_A), datosEvento(ORG_A, 'Concierto de A'))
  await setDoc(doc(db, 'eventos', EVENTO_B), datosEvento(ORG_B, 'Show de B'))

  await setDoc(doc(db, 'registros', REGISTRO_A), datosRegistro(EVENTO_A, 'QR-AAAA-1111'))
  await setDoc(doc(db, 'registros', REGISTRO_B), datosRegistro(EVENTO_B, 'QR-BBBB-2222'))
}
