import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
} from 'firebase/firestore'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { LIMITES_POR_PLAN } from '../../src/shared/types.ts'
import { nuevoDocumentoOrganizador } from '../../src/services/organizadores.ts'
import {
  ORG_A,
  ORG_B,
  ORG_C,
  EVENTO_A,
  EVENTO_B,
  REGISTRO_A,
  REGISTRO_B,
  apagarEntorno,
  arrancarEntorno,
  datosEvento,
  datosOrganizador,
  datosRegistro,
  sembrarBase,
} from './ayudas.ts'

/**
 * Criterio de aceptación de la Fase 1, escrito como código:
 *
 *   "Crear un organizador B y confirmar que no puede ver los eventos de A"
 *
 * Un test de seguridad que no falla cuando las reglas están mal no
 * sirve. Estos tests se ejecutan contra el emulador, así que si alguien
 * abre un `allow read, write: if true` por accidento, esto se pone rojo.
 */

let entorno: RulesTestEnvironment

/** Sesión de A, con los claims que le daría un login de Google real. */
const comoA = () => entorno.authenticatedContext(ORG_A, { email: 'a@evento.com' })
const comoB = () => entorno.authenticatedContext(ORG_B, { email: 'b@evento.com' })
const comoC = () => entorno.authenticatedContext(ORG_C, { email: 'c@evento.com' })
const comoVisitante = () => entorno.unauthenticatedContext()

before(async () => { entorno = await arrancarEntorno() })
after(async () => { await apagarEntorno() })
beforeEach(async () => {
  await entorno.clearFirestore()
  await entorno.withSecurityRulesDisabled(sembrarBase)
})

describe('eventos: cada organizador sólo ve los suyos', () => {
  it('B NO puede leer un evento de A', async () => {
    await assertFails(getDoc(doc(comoB().firestore(), 'eventos', EVENTO_A)))
  })

  it('B NO puede listar nada de A, ni siquiera con un query sin filtro', async () => {
    // Este es el test importante. Alguien podría decir "yo filtro por
    // organizadorId en el cliente". No alcanza: las reglas se evalúan
    // por documento, así que el query sin filtro choca contra el
    // documento de A y Firestore rechaza la operación completa.
    await assertFails(getDocs(collection(comoB().firestore(), 'eventos')))
  })

  it('B NO puede listar ni con un where() explícito por su propio uid', async () => {
    // El intento del atacante: filtrar por el uid de A para "quedarse
    // sólo con lo suyo". Firestore no filtra, decide sobre todo.
    await assertFails(
      getDocs(
        query(collection(comoB().firestore(), 'eventos'), where('organizadorId', '==', ORG_A)),
      ),
    )
  })

  it('A SÍ puede leer y listar sus propios eventos, filtrando por su uid', async () => {
    // El list va con where() explícito, que es como lo hace la app
    // (src/services/eventos.ts). No es un detalle de estilo: es la
    // garantía de que el motor de reglas puede resolver la consulta.
    const db = comoA().firestore()
    await assertSucceeds(getDoc(doc(db, 'eventos', EVENTO_A)))

    const propios = await assertSucceeds(
      getDocs(query(collection(db, 'eventos'), where('organizadorId', '==', ORG_A))),
    )
    assert.equal(propios.size, 1)
    assert.equal(propios.docs[0].id, EVENTO_A)
  })

  it('el list SIN filtro se deniega, incluso para el organizador legítimo', async () => {
    // Esto parece molesto y no lo es: es la propiedad de seguridad.
    // Para autorizar un list sin filtro, el motor tendría que poder
    // garantizar que ninguno de los documentos de la colección
    // cumple la regla, y no puede demostrarlo sin que la consulta esté
    // acotada. Deniega entero, y el panel siempre consulta con
    // where('organizadorId','==', uid).
    //
    // La versión ingenua de esta regla (resource.data.organizadorId)
    // además tiraba "Property organizadorId is undefined" en lugar de
    // denegar, porque el motor evalúa la regla contra un recurso sin el
    // campo. Por eso la regla usa .get('organizadorId', null): falla en
    // falso en vez de exploer.
    await assertFails(getDocs(collection(comoA().firestore(), 'eventos')))
  })

  it('un visitante sin sesión no ve ningún evento', async () => {
    await assertFails(getDoc(doc(comoVisitante().firestore(), 'eventos', EVENTO_A)))
    await assertFails(getDocs(collection(comoVisitante().firestore(), 'eventos')))
  })
})

describe('eventos: nobody writes on behalf of somebody else', () => {
  it('B NO puede crear un evento a nombre de A', async () => {
    // El ataque más directo: crear el documento con
    // organizadorId = uid de A y esperar que las reglas lo descarten.
    // Da error de permisos, no "creado pero invisible".
    await assertFails(
      setDoc(doc(comoB().firestore(), 'eventos', 'evento-invasor'), datosEvento(ORG_A, 'Me hago pasar por A')),
    )
  })

  it('B NO puede modificar un evento de A', async () => {
    await assertFails(
      updateDoc(doc(comoB().firestore(), 'eventos', EVENTO_A), { nombre: 'Lo reescribo' }),
    )
  })

  it('B NO puede borrar un evento de A', async () => {
    await assertFails(deleteDoc(doc(comoB().firestore(), 'eventos', EVENTO_A)))
  })

  it('A NO puede quedarse con un evento de B cambiando el organizadorId', async () => {
    // Un cambio de dueño "por la puerta de atrás": el documento es mío
    // ahora, ¿no? Las reglas lo bloquean con noCambiaDueno().
    await assertFails(
      updateDoc(doc(comoA().firestore(), 'eventos', EVENTO_A), { organizadorId: ORG_B }),
    )
  })

  it('A SÍ puede editar y borrar lo suyo', async () => {
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { nombre: 'Concierto de A (editado)' }))
    await assertSucceeds(deleteDoc(doc(db, 'eventos', EVENTO_A)))
  })

  it('A puede crear un evento propio, incluso en plan gratis', async () => {
    await assertSucceeds(
      setDoc(doc(comoA().firestore(), 'eventos', 'evento-nuevo'), datosEvento(ORG_A, 'Otro evento')),
    )
  })
})

describe('registros: el Dueño se resuelve saltando al evento', () => {
  it('B NO puede leer un registro del evento de A', async () => {
    await assertFails(getDoc(doc(comoB().firestore(), 'registros', REGISTRO_A)))
  })

  it('B NO puede listar registros de un evento de A', async () => {
    await assertFails(
      getDocs(
        query(collection(comoB().firestore(), 'registros'), where('eventoId', '==', EVENTO_A)),
      ),
    )
  })

  it('el aislamiento funciona en las dos direcciones: A tampoco lee los de B', async () => {
    // El test espejo. Si el aislamiento fuera por unlucky coincidence
    // (digamos, que B no tiene ningún evento) esto no lo detectaría.
    await assertFails(getDoc(doc(comoA().firestore(), 'registros', REGISTRO_B)))
    await assertFails(
      getDocs(
        query(collection(comoA().firestore(), 'registros'), where('eventoId', '==', EVENTO_B)),
      ),
    )
  })

  it('B NO puede crear registros en el evento de A', async () => {
    await assertFails(
      addDoc(collection(comoB().firestore(), 'registros'), datosRegistro(EVENTO_A, 'QR-FALSO-0000')),
    )
  })

  it('NADIE puede crear registros desde el cliente, ni el propio A', async () => {
    // El create está cerrado para todos. El alta real pasa por
    // /api/registro con el Admin SDK, que valida la capacidad del
    // evento y genera el QR antes de escribir. Si esto se abriera, se
    // podría escribir ilimitado en cualquier evento, sin verificación.
    await assertFails(
      addDoc(collection(comoA().firestore(), 'registros'), datosRegistro(EVENTO_A, 'QR-9999-9999')),
    )
  })

  it('B NO puede aprobar un registro de A ni marcarlo como usado', async () => {
    await assertFails(updateDoc(doc(comoB().firestore(), 'registros', REGISTRO_A), { estado: 'aprobado' }))
    await assertFails(updateDoc(doc(comoB().firestore(), 'registros', REGISTRO_A), { usado: true }))
  })

  it('A NO puede marcar como usado un registro (eso es la Fase 7)', async () => {
    await assertFails(updateDoc(doc(comoA().firestore(), 'registros', REGISTRO_A), { usado: true }))
  })

  it('A NO puede mover un registro a otro evento', async () => {
    await assertFails(
      updateDoc(doc(comoA().firestore(), 'registros', REGISTRO_A), { eventoId: EVENTO_B }),
    )
  })

  it('A SÍ puede ver, aprobar, editar los datos y borrar sus registros', async () => {
    const db = comoA().firestore()
    await assertSucceeds(getDoc(doc(db, 'registros', REGISTRO_A)))
    await assertSucceeds(updateDoc(doc(db, 'registros', REGISTRO_A), { estado: 'rechazado' }))
    await assertSucceeds(updateDoc(doc(db, 'registros', REGISTRO_A), { telefono: '+5491199999999' }))
    await assertSucceeds(deleteDoc(doc(db, 'registros', REGISTRO_A)))
  })
})

describe('organizadores: el plan es intocable desde el cliente', () => {
  it('un organizador NO puede autopromoverse a pro+', async () => {
    await assertFails(
      updateDoc(doc(comoA().firestore(), 'organizadores', ORG_A), { plan: 'pro+' }),
    )
  })

  it('un organizador NO puede habilitarse el banner ni el logo', async () => {
    // El motivo de la regla: los límites se aplican al renderizar el
    // widget. Si el doc dice que tiene banner, tiene banner.
    await assertFails(
      updateDoc(doc(comoA().firestore(), 'organizadores', ORG_A), {
        limitesPersonalizacion: { ...LIMITES_POR_PLAN['pro+'] },
      }),
    )
  })

  it('un organizador NO puede resucitarse a sí mismo de una suspensión', async () => {
    // Primero se suspende de verdad, que es lo que hace el super-admin.
    // Recién con la cuenta suspendida el test tiene sentido: contra un
    // documento ya en 'activo', mandar 'activo' no cambia nada y
    // cualquier regla lo deja pasar (es un no-op, no una escalada).
    await entorno.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'suspendido' }),
    )
    await assertFails(
      updateDoc(doc(comoA().firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'activo' }),
    )
  })

  it('SÍ puede cambiar su nombre y su brandingPanel', async () => {
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'organizadores', ORG_A), { nombre: 'Mi Empresa SRL' }))
    await assertSucceeds(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: null, colorPrimario: '#1d4ed8', colorSecundario: null },
      }),
    )
  })

  it('B NO puede tocar el documento de A', async () => {
    await assertFails(updateDoc(doc(comoB().firestore(), 'organizadores', ORG_A), { nombre: 'Secuestro' }))
    await assertFails(deleteDoc(doc(comoB().firestore(), 'organizadores', ORG_A)))
  })

  it('A SÍ puede borrar su propio documento (la cascada la hace DELETE /api/me)', async () => {
    // El borrado real con eventos, registros y Auth lo hace el backend;
    // la regla sólo tiene que dejar pasar el propio y frenar el ajeno
    // (cubierto en el test de arriba).
    await assertSucceeds(deleteDoc(doc(comoA().firestore(), 'organizadores', ORG_A)))
  })

  it('B NO puede listar todos los organizadores', async () => {
    await assertFails(getDocs(collection(comoB().firestore(), 'organizadores')))
  })

  it('un organizador nuevo puede preguntar por su propio documento y obtener "no existe"', async () => {
    // Esto NO es un permission-denied, y es a propósito. El frontend
    // necesita distinguir "todavía no terminé el onboarding" de "me
    // saltaron el alta": para eso tiene que poder leer su propio path
    // aunque el documento no exista todavía, y que la respuesta sea
    // exists() == false.
    //
    // Lo que no puede es leer el de otro. Eso sí está en los tests de
    // arriba, y ahí sí es permission-denied.
    await entorno.clearFirestore()
    const snapshot = await assertSucceeds(getDoc(doc(comoC().firestore(), 'organizadores', ORG_C)))
    assert.equal(snapshot.exists(), false)
  })
})

describe('la sincronía entre las reglas y la tabla de TypeScript', () => {
  it('el alta con los límites de LIMITES_POR_PLAN.gratis es aceptada', async () => {
    // Esta es la red de seguridad entre los dos lados. Las reglas
    // tienen hardcodeado el plan gratis porque no pueden importar
    // TypeScript; este test manda a escribir el payload que arma la
    // APP de verdad, con los valores de la tabla. Si alguien cambia
    // LIMITES_POR_PLAN.gratis y olvida actualizar firestore.rules, este
    // test se pone rojo.
    await entorno.clearFirestore()

    await assertSucceeds(
      setDoc(
        doc(comoC().firestore(), 'organizadores', ORG_C),
        nuevoDocumentoOrganizador(ORG_C, 'c@evento.com', 'Empresa C'),
      ),
    )
  })

  it('no se puede nascerse en pro+ aunque se manden los límites de pro+', async () => {
    await entorno.clearFirestore()
    await assertFails(
      setDoc(
        doc(comoC().firestore(), 'organizadores', ORG_C),
        datosOrganizador(ORG_C, 'c@evento.com', {
          plan: 'pro+',
          limitesPersonalizacion: LIMITES_POR_PLAN['pro+'],
        }),
      ),
    )
  })

  it('no se puede nascerse con un email que no sea el de la sesión', async () => {
    await entorno.clearFirestore()
    await assertFails(
      setDoc(
        doc(comoC().firestore(), 'organizadores', ORG_C),
        datosOrganizador(ORG_C, 'victima@evento.com'),
      ),
    )
  })

  it('no se puede crear el documento de otro uid', async () => {
    await entorno.clearFirestore()
    await assertFails(
      setDoc(
        doc(comoC().firestore(), 'organizadores', ORG_A),
        datosOrganizador(ORG_A, 'a@evento.com'),
      ),
    )
  })
})
