import { after, before, beforeEach, describe, it } from 'node:test'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

import { LIMITES_POR_PLAN } from '../../src/shared/types.ts'
import {
  ORG_A,
  UID_ADMIN,
  apagarEntorno,
  arrancarEntorno,
  datosEvento,
  datosOrganizador,
  sembrarBase,
} from './ayudas.ts'

/**
 * Los límites comerciales, escritos como código.
 *
 * `limitesPersonalizacion` no es una descripción de la UI: es la
 * diferencia entre un plan que vale y uno que no. Antes de la Fase 2 los
 * tres interruptores existían y no los miraba NADIE del lado de las
 * reglas. Se mostraban en el panel como texto informativo y eso era todo,
 * así que la restricción comercial era técnicamente falsa:
 *
 *   updateDoc(doc(db,'organizadores',miUid), {'brandingPanel.logoUrl':'…'})
 *
 * funcionaba en un plan gratis.
 *
 * Estos tests son el criterio de aceptación de eso. Un test de seguridad
 * que no falla cuando las reglas están mal no sirve, y estos corren contra
 * el emulador: si alguien abre un `if true`, se ponen rojos.
 */

let entorno: RulesTestEnvironment

const comoA = () => entorno.authenticatedContext(ORG_A, { email: 'a@evento.com' })
const comoAdmin = () =>
  entorno.authenticatedContext(UID_ADMIN, { email: 'admin@plataforma.com', admin: true })

before(async () => { entorno = await arrancarEntorno() })
after(async () => { await apagarEntorno() })
beforeEach(async () => {
  await entorno.clearFirestore()
  await entorno.withSecurityRulesDisabled(sembrarBase)
})

/** Otorga una excepción comercial, como haría el super-admin a mano. */
async function comoAdminConcede(excepcion: Record<string, unknown>): Promise<void> {
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await updateDoc(doc(db, 'organizadores', ORG_A), {
      limitesPersonalizacion: { ...LIMITES_POR_PLAN.gratis, ...excepcion },
    })
  })
}

describe('branding: el color se puede cambiar si el plan lo permite', () => {
  it('A SÍ cambia su color primario, en plan gratis', async () => {
    // El plan gratis tiene colorPersonalizadoPermitido: true, así que el
    // "o" de la regla tiene que dejarlo pasar. Si la regla estuviera
    // escrita con un "y" en vez de un "o", este test es el que lo detecta.
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: null, colorPrimario: '#dc2626', colorSecundario: null },
      }),
    )
  })

  it('A SÍ cambia su nombre y su color en la misma operación', async () => {
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        nombre: 'Mi empresa de eventos',
        brandingPanel: { logoUrl: null, colorPrimario: '#16a34a', colorSecundario: null },
      }),
    )
  })
})

describe('branding: el logo está detrás de un plan pago', () => {
  it('A NO puede poner un logo en un plan gratis', async () => {
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: null, colorSecundario: null },
      }),
    )
  })

  it('A NO puede colar el logo en un update que además cambia el color', async () => {
    // El caso que importa: no alcanza con que el update "parezca" legítimo.
    // Si la regla chequeara sólo que el color esté permitido, este update
    // pasaría y el logo entraría de contrabando.
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: '#dc2626', colorSecundario: null },
      }),
    )
  })

  it('A NO puede borrar un color revocado con un setDoc que lo omite', async () => {
    // El ataque de verdad contra la comparación contra resource.data.
    //
    // `updateDoc` hace merge profundo, así que mandar
    // {brandingPanel:{logoUrl:null}} no borra nada: los colores quedan
    // intactos y la regla lo permite, que es lo correcto. Para BORRAR un
    // campo hay que hacer un setDoc completo que lo omita, y ahí el campo
    // pasa de '#dc2626' a ausente.
    //
    // La comparación con resource.data tiene que fallar cerrada en ese
    // caso: si el plan no permite color, el valor tiene que SEGUIR
    // SIENDO el que está, sea lo que sea. Y no en null: si comparara
    // contra null, omitir el campo y mandarlo a null serían lo mismo, y
    // la excepción se perdería igual de fácil.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await updateDoc(doc(db, 'organizadores', ORG_A), {
        // Excepción commercial ya revocada: tenía color, ya no le corresponde.
        limitesPersonalizacion: {
          ...LIMITES_POR_PLAN.gratis,
          colorPersonalizadoPermitido: false,
        },
        brandingPanel: { logoUrl: null, colorPrimario: '#dc2626', colorSecundario: null },
      })
    })

    const db = comoA().firestore()
    const completo = datosOrganizador(ORG_A, 'a@evento.com')

    await assertFails(
      setDoc(doc(db, 'organizadores', ORG_A), {
        ...completo,
        brandingPanel: { logoUrl: null },
      }),
    )
  })
})

describe('branding: la excepción comercial del super-admin no se pierde', () => {
  it('concedido el permiso, A puede poner un logo', async () => {
    await comoAdminConcede({ logoPermitido: true })
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: null, colorSecundario: null },
      }),
    )
  })

  it('el logo ya concedido sobrevive a un guardado posterior', async () => {
    // Éste es el motivo de comparar contra resource.data y no contra
    // null. Con la excepción activa, el logo quedó puesto. Si la regla
    // dijera "si no está permitido, el logo tiene que ser null", el
    // siguiente guardado de cualquier otro campo de branding borraría el
    // logo que el super-admin habilitó, y la excepción sería de un
    // guardado solamente.
    await comoAdminConcede({ logoPermitido: true })
    const db = comoA().firestore()
    await updateDoc(doc(db, 'organizadores', ORG_A), {
      brandingPanel: { logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: '#7c3aed', colorSecundario: null },
    })

    // Ahora un guardado más, con la MISMA excepción vigente.
    await assertSucceeds(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: '#0ea5e9', colorSecundario: null },
      }),
    )
  })

  it('el super-admin no está sujeto a los límites que él otorga', async () => {
    // Si los límites también le exigieran el permiso al super-admin,
    // otorgar una excepción obligaría a editar las reglas, que es
    // justamente lo que se quiere evitar.
    const db = comoAdmin().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        brandingPanel: { logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: '#dc2626', colorSecundario: null },
      }),
    )
  })
})

describe('capacidad: el evento no puede exceder lo que da el plan', () => {
  it('A SÍ crea un evento con la capacidad exacta del plan gratis', async () => {
    // El límite de borde: 100 con un tope de 100 tiene que pasar. Si la
    // regla fuera `<` en vez de `<=`, el plan gratis no podría abrir un
    // evento de 100 entradas, que es exactamente lo que el plan promete.
    const db = comoA().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'eventos', 'al-borde'), {
        ...datosEvento(ORG_A, 'Evento al borde'),
        capacidadMaxima: LIMITES_POR_PLAN.gratis.capacidadMaximaPorEvento,
      }),
    )
  })

  it('A NO puede crear un evento con una entrada más que el plan', async () => {
    const db = comoA().firestore()
    await assertFails(
      setDoc(doc(db, 'eventos', 'demasiado-grande'), {
        ...datosEvento(ORG_A, 'Un millón de entradas'),
        capacidadMaxima: LIMITES_POR_PLAN.gratis.capacidadMaximaPorEvento + 1,
      }),
    )
  })

  it('A NO puede crear un evento con capacidad cero', async () => {
    const db = comoA().firestore()
    await assertFails(
      setDoc(doc(db, 'eventos', 'capacidad-cero'), {
        ...datosEvento(ORG_A, 'Evento sin lugar'),
        capacidadMaxima: 0,
      }),
    )
  })

  it('A NO puede mandar la capacidad como texto para que compare cualquier cosa', async () => {
    // Con el `is int`, una capacidad que llega como texto se deniega
    // directo, sin coercionar: falla cerrada. Este test fija que no se
    // puede abusar de la comparación para esquivar el tope.
    const db = comoA().firestore()
    await assertFails(
      setDoc(doc(db, 'eventos', 'capacidad-string'), {
        ...datosEvento(ORG_A, 'Capacidad tramposa'),
        capacidadMaxima: '1000000',
      }),
    )
  })

  it('la excepción del super-admin levanta el tope sin deployar', async () => {
    await comoAdminConcede({ capacidadMaximaPorEvento: 1_000 })
    const db = comoA().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'eventos', 'evento-pro'), {
        ...datosEvento(ORG_A, 'Evento con excepción'),
        capacidadMaxima: 1_000,
      }),
    )
    // Y el tope nuevo sigue valiendo: 1001 sigue siendo demasiado.
    await assertFails(
      setDoc(doc(db, 'eventos', 'evento-pro-2'), {
        ...datosEvento(ORG_A, 'Evento que se pasó'),
        capacidadMaxima: 1_001,
      }),
    )
  })

  it('el super-admin puede abrir cualquier capacidad', async () => {
    const db = comoAdmin().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'eventos', 'evento-admin'), {
        ...datosEvento(ORG_A, 'Evento del admin'),
        capacidadMaxima: 1_000_000,
      }),
    )
  })
})

describe('capacidad: sólo se valida al crear, no al editar', () => {
  it('A puede bajar la capacidad de un evento existente', async () => {
    // Bajar la capacidad es una operación legítima y frecuente: se vendieron
    // 80 de 100 y achicás el evento. Si el update estuviera sujeto al
    // mismo tope del create, un cliente que le bajara la capacidad a un
    // evento chico no podría agrandarlo nunca más y el formulario se
    // volvería imposible de usar.
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-de-a'), { capacidadMaxima: 50 }))
  })
})

describe('los límites del organizador no se autoleditan', () => {
  it('A NO puede concessionarse el logo a sí mismo', async () => {
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        limitesPersonalizacion: { ...LIMITES_POR_PLAN.gratis, logoPermitido: true },
      }),
    )
  })

  it('A NO puede subirse la capacidad a sí mismo', async () => {
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'organizadores', ORG_A), {
        limitesPersonalizacion: { ...LIMITES_POR_PLAN.gratis, capacidadMaximaPorEvento: 1_000_000 },
      }),
    )
  })
})
