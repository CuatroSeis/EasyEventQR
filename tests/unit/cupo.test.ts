import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  LIMITES_POR_DEFECTO,
  evaluarCupo,
  mensajeDeMotivo,
  type Configuracion,
  type Contador,
} from '../../api/lib/cupo.ts'

/**
 * Tests del limitador.
 *
 * Las tres ventanas son el lugar donde este límite puede quedar mal y
 * nadie se entera: si una se reinicia de más, el límite que parecía
 * proteger la cuota de mails de Brevo no la protege, y el primer síntoma
 * es un mail de Brevo diciendo que se pasó de 300.
 *
 * Por eso los tests usan un reloj fijo y passed en la variable. No hay
 * `setTimeout` ni esperas: son nanosegundos.
 */

const AHORA = 1_767_225_600_000
const MINUTO = 60_000
const HORA = 3_600_000
const DIA = 86_400_000

/** Un contador sano, con las ventanas recién abiertas en AHORA. */
function contador(over: Partial<Contador> = {}): Contador {
  return {
    pedidos: 0,
    enviosHora: 0,
    enviosDia: 0,
    desdeMinuto: AHORA,
    desdeHora: AHORA,
    desdeDia: AHORA,
    ...over,
  }
}

const SUAVE = { pedidosPorMinuto: 100, enviosPorHora: 100, enviosPorDia: 100 }

/**
 * Avanza `veces` requests, todos dentro de la ventana, y devuelve el
 * contador.
 *
 * Además de que sea cómodo, asserta que CADA request intermedio pasó. Un
 * bucle que sólo mira el final se puede pasar con un limitador que corta
 * en el request 3 y devuelve un contadorraro.
 */
function avanzar(
  desde: Contador,
  veces: number,
  config: Configuracion,
  paso = 1,
): Contador {
  let actual = desde
  for (let i = 0; i < veces; i += 1) {
    const d = evaluarCupo(actual, AHORA + i * paso, config)
    assert.equal(d.permitido, true, `el request ${i + 1} de ${veces} tenía que pasar`)
    actual = d.siguiente
  }
  return actual
}

describe('evaluarCupo: el primer request', () => {
  it('sin documento previo, pasa y deja los contadores en 1', () => {
    const d = evaluarCupo(null, AHORA)
    assert.equal(d.permitido, true)
    assert.equal(d.motivo, 'ok')
    assert.deepEqual(d.siguiente, {
      pedidos: 1,
      enviosHora: 1,
      enviosDia: 1,
      desdeMinuto: AHORA,
      desdeHora: AHORA,
      desdeDia: AHORA,
    })
  })

  it('sin documento previo hay que escribir', () => {
    assert.equal(evaluarCupo(null, AHORA).escribir, true)
  })
})

describe('evaluarCupo: la ventana del minuto', () => {
  it('va sumando requests mientras la ventana esté abierta', () => {
    const c = avanzar(contador(), 5, SUAVE, 10)
    assert.equal(c.pedidos, 5)
  })

  it('corta en el request número 61 con los límites por defecto', () => {
    // 60 por minuto: el request 60 entra, el 61 no. El borde es el que
    // importa, porque un límite de 60 que en realidad deja pasar 61 no
    // protege a nadie.
    //
    // Los límites de envío van aflojados a propósito: el que se está
    // probando acá es el de requests, y con los de envío en 10/hora el
    // contador se frena en el request número 10 y el test mide otra
    // cosa. Cada ventana tiene su propio test.
    const soloPedidos = { ...LIMITES_POR_DEFECTO, enviosPorHora: 100, enviosPorDia: 100 }

    const c = avanzar(contador(), 60, soloPedidos)
    assert.equal(c.pedidos, 60)

    const d = evaluarCupo(c, AHORA + 60, soloPedidos)
    assert.equal(d.permitido, false)
    assert.equal(d.motivo, 'pedidos')
  })

  it('la ventana del minuto se reinicia sola', () => {
    const c = contador({ pedidos: 60 })
    const d = evaluarCupo(c, AHORA + MINUTO, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, true, 'un minuto después tiene que volver a entrar')
    assert.equal(d.siguiente.pedidos, 1)
    assert.equal(d.siguiente.desdeMinuto, AHORA + MINUTO)
  })

  it('justo antes de que venza la ventana todavía está cortada', () => {
    const d = evaluarCupo(contador({ pedidos: 60 }), AHORA + MINUTO - 1, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, false)
  })
})

describe('evaluarCupo: las ventanas de envío', () => {
  it('corta en el undécimo envío de la hora', () => {
    const c = avanzar(contador(), 10, LIMITES_POR_DEFECTO)
    assert.equal(c.enviosHora, 10)

    const d = evaluarCupo(c, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, false)
    assert.equal(d.motivo, 'envios-hora')
  })

  it('corta en el Trigésimo primer envío del día', () => {
    // El más importante de los tres: este es el que protege la cuota de
    // Brevo. 30 por día deja pasar 70 días de margen sobre los 300 mails
    // del plan gratis, que es lo que hace falta para los eventos que se
    // caen el mismo día.
    //
    // El límite de la hora va aflojado para poder llegar al 31 sin que
    // sea el de la hora el que corte antes.
    const soloDia = { ...LIMITES_POR_DEFECTO, enviosPorHora: 100 }

    const c = avanzar(contador(), 30, soloDia)
    assert.equal(c.enviosDia, 30)

    const d = evaluarCupo(c, AHORA, soloDia)
    assert.equal(d.permitido, false)
    assert.equal(d.motivo, 'envios-dia')
  })

  it('el tope del día sobrevive a que se abra la ventana de la hora', () => {
    // El bug que este test existe para cazar: si `enviosDia` compartiera
    // la ventana de la hora, 10 envíos por hora alcanzarían el "tope" de
    // 30 cinco veces y el límite diario no limitaría nada. 29 enviados
    // ayer, la ventana de la hora vencida, y este envío es el 30: entra.
    // El 31 no.
    const c = contador({ enviosDia: 29, desdeHora: AHORA - HORA - 1 })
    const entrada = evaluarCupo(c, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(entrada.permitido, true)
    assert.equal(entrada.siguiente.enviosHora, 1, 'la ventana de la hora se abre')
    assert.equal(entrada.siguiente.enviosDia, 30, 'el total del día sigue subiendo')

    const rechazada = evaluarCupo(entrada.siguiente, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(rechazada.permitido, false)
    assert.equal(rechazada.motivo, 'envios-dia')
  })

  it('el tope del día sobrevive a que se abra la ventana del minuto', () => {
    const c = contador({ enviosDia: 30, desdeMinuto: AHORA - MINUTO - 1 })
    const d = evaluarCupo(c, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, false)
    assert.equal(d.motivo, 'envios-dia')
  })

  it('la ventana del día también se abre sola', () => {
    // El caso que hace que un evento de la semana pasada no quede con
    // el evento entero trabado: ayer se llenó el día, hoy tiene que
    // volver a pasar.
    const c = contador({
      enviosDia: 30,
      desdeDia: AHORA - DIA - 1,
      desdeHora: AHORA - HORA - 1,
      desdeMinuto: AHORA - MINUTO - 1,
    })
    const d = evaluarCupo(c, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, true)
    assert.equal(d.siguiente.enviosDia, 1, 'el día arranca en 1, no en 31')
    assert.equal(d.siguiente.desdeDia, AHORA)
  })

  it('las tres ventanas se abren por separado, no juntas', () => {
    // Un minuto nuevo NO reinicia la hora ni el día. Acá el corte lo
    // dispara el límite de la hora, que se evalúa antes que el del día;
    // lo que importa es que ninguna ventana se abra de golpe y que el
    // contador quede como estaba.
    const c = contador({ pedidos: 60, enviosHora: 10, enviosDia: 30 })
    const d = evaluarCupo(c, AHORA + MINUTO, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, false)
    assert.deepEqual(d.siguiente, c, 'ninguna ventana se reinició')
  })
})

describe('evaluarCupo: qué pasa con el contador cuando se rechaza', () => {
  it('NO escribe cuando rechaza', () => {
    // La parte del diseño que evita que el limitador sea un vector de
    // denegación de servicio: Firestore da 20.000 escrituras por día en
    // Spark, y si el limitador escribiera en cada request, un spammer
    // consumiendo la cuota escribiría menos que el resto del producto
    // combinado.
    const c = avanzar(contador(), 60, { ...LIMITES_POR_DEFECTO, enviosPorHora: 100, enviosPorDia: 100 })

    for (let i = 0; i < 500; i += 1) {
      const d = evaluarCupo(c, AHORA + i, LIMITES_POR_DEFECTO)
      assert.equal(d.permitido, false)
      assert.equal(d.escribir, false, 'un request rechazado no debe escribir')
    }
  })

  it('un request rechazado no suma al contador', () => {
    const c = contador({ enviosDia: 30 })
    const d = evaluarCupo(c, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, false)
    assert.deepEqual(d.siguiente, c, 'el contador tiene que quedar como estaba')
  })

  it('el pedido rechazado tampoco cuenta para el minuto', () => {
    // Un bot que reintenta en bucle no tiene que empujar su propio
    // contador hacia arriba: cuando la ventana se abra, arranca limpio.
    const c = contador({ enviosHora: 10, pedidos: 3 })
    const d = evaluarCupo(c, AHORA, LIMITES_POR_DEFECTO)
    assert.equal(d.permitido, false)
    assert.equal(d.siguiente.pedidos, 3)
  })
})

describe('evaluarCupo: límites a medida', () => {
  it('respeta una configuración más apretada', () => {
    const estricto = { pedidosPorMinuto: 2, enviosPorHora: 2, enviosPorDia: 2 }
    const c = avanzar(contador(), 2, estricto)
    const d = evaluarCupo(c, AHORA, estricto)
    assert.equal(d.permitido, false)
  })

  it('un límite de 0 corta todo', () => {
    // El caso de un evento que se cerró: se pone en 0 y nadie más entra.
    const cerrado = { pedidosPorMinuto: 0, enviosPorHora: 0, enviosPorDia: 0 }
    const d = evaluarCupo(null, AHORA, cerrado)
    assert.equal(d.permitido, false)
  })

  it('un reloj que anda para atrás no rompe nada', () => {
    // NTP o un cambio de zona pueden hacer que `ahora` venga antes que
    // `desdeMinuto`. `ahora - desde` da negativo, que es menor que
    // cualquier ventana, así que la ventana se considera vigente y no
    // se abre de golpe: el que va atrasado no gana cupo extra.
    const c = contador({ desdeMinuto: AHORA + 5_000, desdeHora: AHORA + 5_000, desdeDia: AHORA + 5_000 })
    const d = evaluarCupo(c, AHORA, SUAVE)
    assert.equal(d.permitido, true)
    assert.equal(d.siguiente.pedidos, 1)
  })
})

describe('mensajeDeMotivo', () => {
  it('dice algo útil en castellano para cada motivo', () => {
    for (const motivo of ['pedidos', 'envios-hora', 'envios-dia'] as const) {
      const mensaje = mensajeDeMotivo(motivo)
      assert.ok(mensaje.length > 0, `${motivo} necesita un mensaje`)
      assert.ok(mensaje.includes(' '), `${motivo} no puede ser una palabra suelta`)
    }
  })

  it('no dice en qué límite se cayó', () => {
    // Decirle a un atacante "te pasaste del límite de 30 por día" es
    // regalarle el número del límite. Que noexcept sepa.
    const porHora = mensajeDeMotivo('envios-hora')
    const porDia = mensajeDeMotivo('envios-dia')
    assert.equal(porHora, porDia, 'los dos límites de envío dan el mismo mensaje')
  })

  it('el motivo ok no tiene mensaje', () => {
    assert.equal(mensajeDeMotivo('ok'), '')
  })
})
