import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  nuevoDocumentoEvento,
  validarBorrador,
  type BorradorEvento,
} from '../../src/services/documentoEvento.ts'
import { LIMITES_POR_PLAN } from '../../src/shared/types.ts'

/**
 * Tests de la validacion del borrador, en el navegador.
 *
 * Esto NO es seguridad. La seguridad esta en la regla
 * `capacidadDentroDelPlan` de firestore.rules, y si estos tests pasan y
 * la regla no, el error es de reglas, no de aca. Lo que se testea es lo
 * que hace que el organizador se entere en el celular de que se pasa por
 * el limite, en vez de recibir un error de permisos que no entiende.
 *
 * El limite se pasa por parametro justamente para que estos tests puedan
 * iterar sobre LIMITES_POR_PLAN: si la tabla de planes sube un numero y
 * la validacion del cliente queda con el valor viejo, estos tests
 * bajan. Ese es el motivo de que el primer test sea una comparacion
 * contra la tabla y no contra un numero escrito a mano.
 */

function borradorValido(extra: Partial<BorradorEvento> = {}): BorradorEvento {
  return {
    nombre: 'Cena de prueba',
    fecha: new Date('2026-06-01T20:00:00'),
    lugar: 'Salón del barrio',
    descripcion: '',
    capacidadMaxima: 30,
    requierePago: false,
    precioEntrada: null,
    bannerUrl: null,
    ...extra,
  }
}

function camposConProblema(problemas: { campo: string }[]): string[] {
  return problemas.map((p) => p.campo).sort()
}

describe('validarBorrador', () => {
  it('un borrador razonable no tiene problemas', () => {
    assert.deepEqual(validarBorrador(borradorValido(), 100), [])
  })

  it('rechaza el nombre vacio, aunque sean espacios', () => {
    // El caso real: el campo tiene autofocus y el usuario aprieta
    // "crear" sin tocar nada. Un `if (!nombre)` solo no alcanza, porque
    // "   " es truthy en JavaScript y se guardaba un evento sin nombre.
    for (const nombre of ['', '   ', '\n\t']) {
      const problemas = validarBorrador(borradorValido({ nombre }), 100)
      assert.ok(
        problemas.some((p) => p.campo === 'nombre'),
        `debería pedir el nombre para ${JSON.stringify(nombre)}`,
      )
    }
  })

  it('rechaza una fecha invalida', () => {
    const problemas = validarBorrador(borradorValido({ fecha: new Date('nope') }), 100)
    assert.ok(problemas.some((p) => p.campo === 'fecha'))
  })

  it('rechaza la capacidad por el limite del plan', () => {
    const problemas = validarBorrador(borradorValido({ capacidadMaxima: 101 }), 100)
    const delCampo = problemas.find((p) => p.campo === 'capacidadMaxima')
    assert.ok(delCampo, 'debería avisar del limite')
    // El mensaje tiene que decir el numero, porque "te pasaste" sin
    // decir hasta cuanto no le sirve de nada al que esta configuring.
    assert.match(delCampo.mensaje, /100/)
  })

  it('acepta la capacidad justa en el limite', () => {
    // El borde: 100 con limite 100 tiene que pasar. Un `<=` equivocado
    // de mas le costaria al usuario una entrada por evento sin avisar.
    assert.deepEqual(validarBorrador(borradorValido({ capacidadMaxima: 100 }), 100), [])
  })

  it('rechaza capacidad cero, negativa o decimal', () => {
    // El decimal es el caso traicionero: llega del
    // <input type="number"> con step sin especificar, y
    // Number.parseInt(30.5) da 30 pero un Number() directo daria 30.5.
    // Firestore guardaria 30.5 y la regla, que compara contra un entero,
    // lo rechaza con un error de permisos en vez de uno de validacion.
    for (const capacidad of [0, -1, 30.5, Number.NaN]) {
      const problemas = validarBorrador(borradorValido({ capacidadMaxima: capacidad }), 100)
      assert.ok(
        problemas.some((p) => p.campo === 'capacidadMaxima'),
        `debería rechazar la capacidad ${capacidad}`,
      )
    }
  })

  it('exige precio mayor a cero si el evento es pago', () => {
    for (const precio of [null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const problemas = validarBorrador(
        borradorValido({ requierePago: true, precioEntrada: precio }),
        100,
      )
      assert.ok(
        problemas.some((p) => p.campo === 'precioEntrada'),
        `debería rechazar el precio ${precio}`,
      )
    }
  })

  it('no mira el precio si el evento es gratis', () => {
    // Al reves: un evento gratis con precioEntrada en 0 porque el
    // selector de pago quedo en "no" y el campo sin limpiar no es un
    // error. Reclamarlo seria una molestia sin motivo.
    assert.deepEqual(
      validarBorrador(borradorValido({ requierePago: false, precioEntrada: null }), 100),
      [],
    )
  })

  it('reporta todos los problemas juntos, no solo el primero', () => {
    // Si parara en el primero, el usuario corregiria el nombre, aprieta
    // crear de nuevo, y ve el siguiente. En un formulario de celular eso
    // son cuatro viajes de ida y vuelta para cuatro errores.
    const problemas = validarBorrador(
      borradorValido({ nombre: '', lugar: '', capacidadMaxima: 5000 }),
      100,
    )
    assert.deepEqual(camposConProblema(problemas), ['capacidadMaxima', 'lugar', 'nombre'])
  })

  it('el limite que usa es el del plan, para los tres planes', () => {
    // El test que ata las dos puntas: la validacion del cliente y la
    // tabla de planes. Si alguien sube `pro` de 1.000 a 2.000, la
    // iteracion de abajo no lo detecta sola (comparar 1.001 contra 2.000
    // pasaria), pero los tests de reglas de firestore, que leen la misma
    // tabla, si tienen que seguir verdes. Los dos juntos cierran el
    // circulo: mismo numero, dos lugares.
    for (const [plan, limites] of Object.entries(LIMITES_POR_PLAN)) {
      const maximo = limites.capacidadMaximaPorEvento
      assert.ok(Number.isInteger(maximo) && maximo > 0, `${plan} tiene un maximo raro: ${maximo}`)

      assert.deepEqual(
        validarBorrador(borradorValido({ capacidadMaxima: maximo }), maximo),
        [],
        `${plan} deberia permitir exactamente ${maximo}`,
      )
      const problemas = validarBorrador(borradorValido({ capacidadMaxima: maximo + 1 }), maximo)
      assert.ok(
        problemas.some((p) => p.campo === 'capacidadMaxima'),
        `${plan} deberia rechazar ${maximo + 1}`,
      )
    }
  })
})

describe('nuevoDocumentoEvento', () => {
  it('no deja que el organizador se lo asigne a otro', () => {
    // El borrador no tiene organizadorId a proposito: sale del
    // parametro, no del objeto que manda el cliente. Si estuviera en el
    // borrador, un formulario podria escribir el evento en la cuenta de
    // otro y las reglas lo cortarian con un error de permisos en vez de
    // guardarlo donde corresponde.
    const documento = nuevoDocumentoEvento('org-real', borradorValido())
    assert.equal(documento.organizadorId, 'org-real')
  })

  it('un evento nuevo arranca abierto y sin personalizacion', () => {
    // 'activo' y no 'borrador' porque crear un evento que hay que abrir a
    // mano es un paso de mas para el caso comun. Y personalizacion vacia
    // porque en esta fase el branding es del PANEL, no del evento: el
    // evento sale con los defaults del tema y la personalizacion por
    // evento llega en la fase siguiente.
    const documento = nuevoDocumentoEvento('org-real', borradorValido())
    assert.equal(documento.estado, 'activo')
    assert.equal(documento.personalizacion.colorPrimario, null)
    assert.equal(documento.personalizacion.colorSecundario, null)
  })

  it('recorta los textos antes de guardarlos', () => {
    // Un "  Cena  " guardado tal cual se muestra con los espacios en la
    // tarjeta del panel y en el buscador de la pagina publica. Recortar
    // en el constructor y no en la UI es a proposito: es el unico punto
    // por el que pasan todos los caminos de escritura.
    const documento = nuevoDocumentoEvento(
      'org-real',
      borradorValido({ nombre: '  Cena  ', lugar: '  Salon  ', descripcion: '  Trae algo  ' }),
    )
    assert.equal(documento.nombre, 'Cena')
    assert.equal(documento.lugar, 'Salon')
    assert.equal(documento.descripcion, 'Trae algo')
  })

  it('guarda el precio en null si el evento es gratis, no en 0', () => {
    // La diferencia importa al facturar y en cualquier reporte: un
    // evento gratis con precio 0 es distinto de uno sin precio, y "0" se
    // confunde con "el precio salio mal".
    assert.equal(
      nuevoDocumentoEvento('org-real', borradorValido({ requierePago: false, precioEntrada: 5000 }))
        .precioEntrada,
      null,
    )
    assert.equal(
      nuevoDocumentoEvento('org-real', borradorValido({ requierePago: true, precioEntrada: 5000 }))
        .precioEntrada,
      5000,
    )
  })

  it('preserva la fecha del borrador', () => {
    const borrador = borradorValido()
    const documento = nuevoDocumentoEvento('org-real', borrador)
    assert.equal(documento.fecha.getTime(), borrador.fecha.getTime())
  })
})
