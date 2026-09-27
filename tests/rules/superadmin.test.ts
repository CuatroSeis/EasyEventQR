import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { LIMITES_POR_PLAN } from '../../src/shared/types.ts'
import {
  EVENTO_A,
  EVENTO_B,
  ORG_A,
  REGISTRO_A,
  UID_ADMIN,
  apagarEntorno,
  arrancarEntorno,
  datosOrganizador,
  sembrarBase,
} from './ayudas.ts'

/**
 * El super-admin no es "un organizador con más permisos dentro de un
 * documento": es una propiedad de la SESIÓN, en el token.
 *
 * La diferencia es la que importa en seguridad. Si el flag estuviera
 * en `organizadores/{uid}.esAdmin`, el usuario podría editarlo con una
 * sola llamada a updateDoc y sería admin. En un custom claim no: el
 * token lo firma Firebase, el cliente no lo puede tocar, y las reglas
 * lo leen sin necesidad de consultar la base.
 *
 * El trade-off, que también es una decisión de arquitectura: cambiar
 * un claim obliga a que el token se refresque (un logout/login, o
 * forzar el refresh del ID token). Por eso el alta de un claim no es
 * un updateDoc, es el script scripts/asignar-admin.mjs.
 */

let entorno: RulesTestEnvironment

const comoAdmin = () => entorno.authenticatedContext(UID_ADMIN, { admin: true })
const comoA = () => entorno.authenticatedContext(ORG_A, { email: 'a@evento.com' })

before(async () => { entorno = await arrancarEntorno() })
after(async () => { await apagarEntorno() })
beforeEach(async () => {
  await entorno.clearFirestore()
  await entorno.withSecurityRulesDisabled(sembrarBase)
})

describe('super-admin: ve todo, incluso lo de una cuenta suspendida', () => {
  it('lista todos los eventos, sin filtro', async () => {
    const eventos = await assertSucceeds(getDocs(collection(comoAdmin().firestore(), 'eventos')))
    assert.equal(eventos.size, 2)
  })

  it('lee el evento de A y el de B', async () => {
    await assertSucceeds(getDoc(doc(comoAdmin().firestore(), 'eventos', EVENTO_A)))
    await assertSucceeds(getDoc(doc(comoAdmin().firestore(), 'eventos', EVENTO_B)))
  })

  it('lista todos los organizadores', async () => {
    const orgs = await assertSucceeds(getDocs(collection(comoAdmin().firestore(), 'organizadores')))
    assert.equal(orgs.size, 2)
  })

  it('lee los registros de un evento ajeno', async () => {
    await assertSucceeds(getDoc(doc(comoAdmin().firestore(), 'registros', REGISTRO_A)))
  })
})

describe('super-admin: escribe los campos que el cliente no puede', () => {
  it('asigna pro+ y los límites correspondientes', async () => {
    await assertSucceeds(
      updateDoc(doc(comoAdmin().firestore(), 'organizadores', ORG_A), {
        plan: 'pro+',
        limitesPersonalizacion: LIMITES_POR_PLAN['pro+'],
      }),
    )
  })

  it('suspende y reactiva una cuenta', async () => {
    await assertSucceeds(
      updateDoc(doc(comoAdmin().firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'suspendido' }),
    )
    await assertSucceeds(
      updateDoc(doc(comoAdmin().firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'activo' }),
    )
  })

  it('lee el path de un organizador inexistente sin error (no hay documento)', async () => {
    const snapshot = await assertSucceeds(
      getDoc(doc(comoAdmin().firestore(), 'organizadores', 'uid-inexistente')),
    )
    assert.equal(snapshot.exists(), false)
  })

  it('crea el documento de un organizador que todavía no se dio de alta', async () => {
    await assertSucceeds(
      setDoc(
        doc(comoAdmin().firestore(), 'organizadores', 'uid-nuevo'),
        datosOrganizador('uid-nuevo', 'nuevo@evento.com', { plan: 'pro' }),
      ),
    )
  })

  it('NO necesita su propio documento de organizador para operar', async () => {
    // El admin no tiene (ni necesita) una cuenta en /organizadores. Si
    // las reglas exigieran organizacionActiva() para todo, no podría
    // administrar justamente a los que nunca terminaron el alta.
    const snapshot = await assertSucceeds(getDoc(doc(comoAdmin().firestore(), 'organizadores', UID_ADMIN)))
    assert.equal(snapshot.exists(), false)
    await assertSucceeds(updateDoc(doc(comoAdmin().firestore(), 'eventos', EVENTO_A), { nombre: 'Editado por admin' }))
  })
})

describe('suspensión en vivo: sin tocar las reglas', () => {
  it('al suspender a A, A pierde el acceso en la siguiente operación', async () => {
    await assertSucceeds(getDoc(doc(comoA().firestore(), 'eventos', EVENTO_A)))

    await entorno.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'suspendido' }),
    )

    await assertFails(getDoc(doc(comoA().firestore(), 'eventos', EVENTO_A)))
    await assertFails(getDocs(collection(comoA().firestore(), 'eventos')))
    await assertFails(updateDoc(doc(comoA().firestore(), 'eventos', EVENTO_A), { nombre: 'Sigo editando' }))
  })

  it('un suspendido conserva su sesión: la suspensión es de negocio, no de login', async () => {
    // Importante para el panel del Super Admin (Fase 8): el usuario
    // sigue logueado y puede ver el cartel de "suscripción
    // suspendida" con un enlace para pagar. Si la regla lo bloqueara
    // entero, no podría ni mostrarle cómo arreglarlo.
    await entorno.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'suspendido' }),
    )
    await assertSucceeds(getDoc(doc(comoA().firestore(), 'organizadores', ORG_A)))
  })

  it('el super-admin sigue operando sobre la cuenta suspendida', async () => {
    await entorno.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'suspendido' }),
    )
    await assertSucceeds(getDoc(doc(comoAdmin().firestore(), 'eventos', EVENTO_A)))
    await assertSucceeds(
      updateDoc(doc(comoAdmin().firestore(), 'organizadores', ORG_A), { estadoSuscripcion: 'activo' }),
    )
  })
})

describe('sin sesión no hay nada', () => {
  it('ni siquiera puede leer su propio documento de organizador', async () => {
    const anon = entorno.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), 'organizadores', ORG_A)))
    await assertFails(getDocs(collection(anon.firestore(), 'organizadores')))
  })
})
