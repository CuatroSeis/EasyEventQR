import { after, before, beforeEach, describe, it } from 'node:test'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

import { LIMITES_POR_PLAN } from '../../src/shared/types.ts'
import {
  ORG_A,
  EVENTO_A,
  UID_ADMIN,
  apagarEntorno,
  arrancarEntorno,
  conPersonalizacion,
  datosEvento,
  datosOrganizador,
  personalizacionDe,
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
        // Excepción comercial ya revocada: tenía color, ya no le corresponde.
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

describe('categoría del evento', () => {
  it('A crea con una categoría soportada', async () => {
    const db = comoA().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'eventos', 'evento-con-categoria'), {
        ...datosEvento(ORG_A, 'Evento categorizado'),
        categoria: 'energy-earth',
      }),
    )
  })

  it('A NO puede crear con una llave inventada', async () => {
    const db = comoA().firestore()
    await assertFails(
      setDoc(doc(db, 'eventos', 'evento-categoria-trampa'), {
        ...datosEvento(ORG_A, 'Evento inválido'),
        categoria: 'xss',
      }),
    )
  })

  it('A edita con una categoría válida o null', async () => {
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { categoria: 'trigger-ocean' }))
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { categoria: null }))
  })

  it('A NO edita con una llave inventada', async () => {
    const db = comoA().firestore()
    await assertFails(updateDoc(doc(db, 'eventos', EVENTO_A), { categoria: 'xss' }))
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

  it('A NO puede abrir un evento con una capacidad fraccional', async () => {
    // El otro caso del `is int`, y el que de verdad lo necesita: comparar
    // cosas de tipos distintos da FALSE, así que un string ya lo rechaza
    // el `<= 100` de la regla. Pero 99.5 es un número y `99.5 <= 100` es
    // VERDADERO: sin el `is int` un plan gratis podría abrir un evento con
    // 99,5 entradas y bajar de ahí en decimales.
    const db = comoA().firestore()
    await assertFails(
      setDoc(doc(db, 'eventos', 'capacidad-decimal'), {
        ...datosEvento(ORG_A, 'Capacidad fraccional'),
        capacidadMaxima: 99.5,
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

describe('capacidad: editarla también respeta el plan', () => {
  it('A NO puede subir la capacidad por encima del plan, ni una entrada', async () => {
    // El test de borde del create (línea de arriba) tiene su espejo acá.
    // Si la regla fuera `<=` en vez de `<` en la rama de suba, este test
    // es el que lo detecta: 101 con un tope de 100 tiene que fallar.
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        capacidadMaxima: LIMITES_POR_PLAN.gratis.capacidadMaximaPorEvento + 1,
      }),
    )
  })

  it('A NO puede abrir un cupo de un millón editando el evento', async () => {
    // El ataque que la Fase 2 dejó abierto y que la Fase 3 cierra: crear
    // un evento chico y después agrandarlo por la puerta de atrás.
    const db = comoA().firestore()
    await assertFails(updateDoc(doc(db, 'eventos', EVENTO_A), { capacidadMaxima: 1_000_000 }))
  })

  it('A NO puede mandar la capacidad como texto para que compare cualquier cosa', async () => {
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'eventos', EVENTO_A), { capacidadMaxima: '1000000' }),
    )
  })

  it('A SÍ puede bajar la capacidad de un evento existente', async () => {
    // Bajar la capacidad es una operación legítima y frecuente: se vendieron
    // 80 de 100 y achicás el evento. Si el update estuviera sujeto al
    // mismo tope del create, un cliente que le bajara la capacidad a un
    // evento chico no podría agrandarlo nunca más y el formulario se
    // volvería imposible de usar.
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { capacidadMaxima: 50 }))
  })

  it('A SÍ puede editar otros campos sin tocar la capacidad', async () => {
    // Guardarraíl de la regla nueva: no se coló en los updates que no
    // tocan la capacidad. Renombrar un evento de 100 con un plan de 100
    // tiene que andar siempre.
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { nombre: 'Concierto renombrado' }))
  })

  it('con excepción concedida, A SÍ puede subir dentro del tope nuevo y NO una más', async () => {
    await comoAdminConcede({ capacidadMaximaPorEvento: 1_000 })
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { capacidadMaxima: 1_000 }))
    await assertFails(updateDoc(doc(db, 'eventos', EVENTO_A), { capacidadMaxima: 1_001 }))
  })

  /**
   * Deja un evento con capacidad por encima del plan del organizador.
   *
   * El escenario: una excepción comercial de 1.000, se abre un evento de
   * 1.000, y después el super-admin le saca la excepción. Es el estado en
   * el que el evento queda "fuera del plan" y del que hay que salir.
   */
  async function sembrarEventoSobreElTope(eventoId: string): Promise<void> {
    await comoAdminConcede({ capacidadMaximaPorEvento: 1_000 })
    const db = comoA().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'eventos', eventoId), {
        ...datosEvento(ORG_A, 'Evento grande'),
        capacidadMaxima: 1_000,
      }),
    )
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizadores', ORG_A), {
        limitesPersonalizacion: { ...LIMITES_POR_PLAN.gratis },
      })
    })
  }

  it('un evento que quedó fuera del plan se puede achicar', async () => {
    // El bloqueo que se evitó poniendo `capacidadDentroDelPlan()` tal cual
    // en el update: si el update exigiera el tope SIEMPRE, este evento
    // quedaría congelado y no se podría bajar a 50.
    await sembrarEventoSobreElTope('evento-sobre-el-tope')
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-sobre-el-tope'), { capacidadMaxima: 50 }))
  })

  it('un evento que quedó fuera del plan se puede renombrar SIN tocar la capacidad', async () => {
    // OJO con que este test no baje la capacidad antes. Si lo hiciera, el
    // renombrado de abajo vería un evento ya dentro del plan y pasaría
    // siempre, con la regla buena y con la mala: el test no probaría nada.
    //
    // Este es el caso que importa de verdad: el organizador quiere
    // corregir la descripción de un evento que quedó sobre el tope, y no
    // tiene por qué bajar la capacidad para poder hacerlo. Si la regla
    // exigiera el tope en todo update, no podría.
    await sembrarEventoSobreElTope('evento-sobre-el-tope')
    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-sobre-el-tope'), { nombre: 'Renombrado' }))
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-sobre-el-tope'), { descripcion: 'Otra descripción' }))
  })

  it('pero un evento sobre el tope NO puede subir la capacidad un poco más', async () => {
    // El otro borde del mismo escenario: estar fuera del plan no es un
    // permiso para empeorar. 1.001 con un tope de 100 se sigue negando.
    await sembrarEventoSobreElTope('evento-sobre-el-tope')
    const db = comoA().firestore()
    await assertFails(updateDoc(doc(db, 'eventos', 'evento-sobre-el-tope'), { capacidadMaxima: 1_001 }))
  })

  it('el super-admin puede subir la capacidad de cualquier evento', async () => {
    const db = comoAdmin().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { capacidadMaxima: 1_000_000 }))
  })
})

describe('el contador de reservas lo escribe el servidor, no el organizador', () => {
  it('A SÍ crea un evento con el contador en cero', async () => {
    const db = comoA().firestore()
    await assertSucceeds(
      setDoc(doc(db, 'eventos', 'contador-en-cero'), datosEvento(ORG_A, 'Contador en cero')),
    )
  })

  it('A NO puede crear un evento que nazca con reservas', async () => {
    // El ataque no necesita llegar a la transacción: un `addDoc` con el
    // contador inventado. Lo que se necesita es que la regla del create
    // lo pida en cero explícitamente, no que "no lo haya tocando nadie".
    const db = comoA().firestore()
    await assertFails(
      setDoc(doc(db, 'eventos', 'contador-mentiroso'), datosEvento(ORG_A, 'Contador mentiroso', { reservas: 5 })),
    )
  })

  it('un evento creado antes de la Fase 3 se puede seguir editando', async () => {
    // Los eventos que ya están en la base no tienen el campo `reservas`.
    // Leer una propiedad inexistente LANZA error en el motor de reglas y
    // deniega la operación entera, así que sin un `get(..., 0)` con
    // default, todos los eventos viejos quedaban ineditables de golpe.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      const viejo = datosEvento(ORG_A, 'Evento de antes de la Fase 3')
      delete viejo.reservas
      await setDoc(doc(ctx.firestore(), 'eventos', 'evento-viejo'), viejo)
    })

    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-viejo'), { nombre: 'Renombrado' }))
  })

  it('A NO puede ni subir ni bajar el contador de un evento con reservas', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'eventos', 'evento-con-reservas'),
        datosEvento(ORG_A, 'Evento con reservas', { reservas: 3 }),
      )
    })

    const db = comoA().firestore()
    // El ataque real: abrirse el propio cupo.
    await assertFails(updateDoc(doc(db, 'eventos', 'evento-con-reservas'), { reservas: -1_000 }))
    await assertFails(updateDoc(doc(db, 'eventos', 'evento-con-reservas'), { reservas: 4 }))
  })

  it('A NO puede colar el contador en un update que además cambia otra cosa', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'eventos', 'evento-con-reservas'),
        datosEvento(ORG_A, 'Evento con reservas', { reservas: 3 }),
      )
    })

    // La comparación contra resource.data no mira el motivo del update:
    // cambiar el nombre de paso no vuelve legítimo tocar el contador.
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'eventos', 'evento-con-reservas'), { nombre: 'Renombrado', reservas: 0 }),
    )
  })

  it('A SÍ puede seguir editando un evento que tiene reservas', async () => {
    // El otro riesgo de una regla que falla cerrada: que congele el
    // evento. Con el contador en 3, cambiar el nombre tiene que andar.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'eventos', 'evento-con-reservas'),
        datosEvento(ORG_A, 'Evento con reservas', { reservas: 3 }),
      )
    })

    const db = comoA().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-con-reservas'), { nombre: 'Renombrado' }))
  })

  it('el super-admin puede corregir el contador a mano', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'eventos', 'evento-con-reservas'),
        datosEvento(ORG_A, 'Evento con reservas', { reservas: 3 }),
      )
    })

    const db = comoAdmin().firestore()
    await assertSucceeds(updateDoc(doc(db, 'eventos', 'evento-con-reservas'), { reservas: 2 }))
  })
})

describe('la personalización del evento la limita el plan', () => {
  it('un plan gratis NO puede crear un evento con banner', async () => {
    const db = comoA().firestore()
    await assertFails(
      setDoc(
        doc(db, 'eventos', 'con-banner-gratis'),
        conPersonalizacion(datosEvento(ORG_A, 'Banner sin permiso'), {
          bannerUrl: 'https://ejemplo.com/banner.png',
        }),
      ),
    )
  })

  it('un plan gratis NO puede crear un evento con logo', async () => {
    const db = comoA().firestore()
    await assertFails(
      setDoc(
        doc(db, 'eventos', 'con-logo-gratis'),
        conPersonalizacion(datosEvento(ORG_A, 'Logo sin permiso'), {
          logoUrl: 'https://ejemplo.com/logo.png',
        }),
      ),
    )
  })

  it('un plan gratis SÍ puede crear un evento con color', async () => {
    // Si esta regla estuviera escrita con un "y" en vez de un "o", el plan
    // gratis no podría tematizar nada y la landing /e/:id sería siempre
    // del color por defecto, que es lo contrario de lo que ofrece.
    const db = comoA().firestore()
    await assertSucceeds(
      setDoc(
        doc(db, 'eventos', 'con-color-gratis'),
        conPersonalizacion(datosEvento(ORG_A, 'Evento con color'), {
          colorPrimario: '#7c3aed',
          colorSecundario: '#0f172a',
        }),
      ),
    )
  })

  it('un plan gratis NO puede poner banner ni logo en un update', async () => {
    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ bannerUrl: 'https://ejemplo.com/banner.png' }),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ logoUrl: 'https://ejemplo.com/logo.png' }),
      }),
    )
  })

  it('un plan gratis SÍ puede poner color en un update', async () => {
    // La contrapartida del test de arriba: la regla no tiene que pasar
    // siempre, tiene que pasar sólo lo que el plan permite.
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ colorPrimario: '#7c3aed', colorSecundario: '#0f172a' }),
      }),
    )
  })

  it('con plan pro el banner entra y el logo no', async () => {
    await comoAdminConcede({ bannerPermitido: true })
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ bannerUrl: 'https://ejemplo.com/banner.png' }),
      }),
    )
    // El mismo update con un logo tiene que seguir fallando: que el plan
    // conceda una cosa no concede la otra.
    await assertFails(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ logoUrl: 'https://ejemplo.com/logo.png' }),
      }),
    )
  })

  it('con plan pro+ el logo entra', async () => {
    await comoAdminConcede({ logoPermitido: true })
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ logoUrl: 'https://ejemplo.com/logo.png' }),
      }),
    )
  })

  it('el logo concedido sobrevive a los guardados posteriores', async () => {
    // Si la regla comparara contra null en vez de contra el valor actual,
    // el guardado siguiente borraría el logo que el super-adminhabilitó
    // y la excepción valdría para un solo guardado.
    await comoAdminConcede({ logoPermitido: true })
    const db = comoA().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ logoUrl: 'https://ejemplo.com/logo.png' }),
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({ logoUrl: 'https://ejemplo.com/logo.png', colorPrimario: '#0ea5e9' }),
      }),
    )
    await assertSucceeds(updateDoc(doc(db, 'eventos', EVENTO_A), { nombre: 'Renombrado' }))
  })

  it('revocado el permiso de color, el valor tiene que SEGUIR SIENDO el que está', async () => {
    // Ni cambiarlo ni borrarlo. Borrarlo sería lo fácil de hacer y lo que
    // arruinaría una excepción comercial: el siguiente guardado de
    // cualquier campo se lleva el color por delante.
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'eventos', 'con-color'),
        conPersonalizacion(datosEvento(ORG_A, 'Evento con color'), { colorPrimario: '#7c3aed' }),
      )
      await updateDoc(doc(ctx.firestore(), 'organizadores', ORG_A), {
        limitesPersonalizacion: { ...LIMITES_POR_PLAN.gratis, colorPersonalizadoPermitido: false },
      })
    })

    const db = comoA().firestore()
    await assertFails(
      updateDoc(doc(db, 'eventos', 'con-color'), {
        personalizacion: personalizacionDe({ colorPrimario: '#dc2626' }),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'eventos', 'con-color'), {
        personalizacion: { ...personalizacionDe({}), colorPrimario: null },
      }),
    )
  })

  it('el super-admin no está sujeto a los límites de personalización', async () => {
    const db = comoAdmin().firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'eventos', EVENTO_A), {
        personalizacion: personalizacionDe({
          bannerUrl: 'https://ejemplo.com/banner.png',
          logoUrl: 'https://ejemplo.com/logo.png',
        }),
      }),
    )
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
