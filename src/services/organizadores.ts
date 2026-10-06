// Extensión explícita: los tests de reglas resuelven en modo "nodenext".
import { LIMITES_POR_PLAN, type Organizador } from '../shared/types.ts'

/**
 * El payload de alta del organizador.
 *
 * Esta función es el ÚNICO lugar del proyecto que decide con qué plan
 * y qué límites nace una cuenta. Tiene tres razones para estar aislada
 * acá y no dentro del componente de login o del servicio de auth:
 *
 *  1. Las reglas de Firestore tienen el plan gratis hardcodeado, porque
 *     el lenguaje de reglas no puede importar TypeScript. Este archivo
 *     y firestore.rules son dos copias del mismo dato, y la forma de
 *     que no se desincronicen no es "tener cuidado": es que
 *     tests/rules/aislamiento.test.ts llama a ESTA función y la manda
 *     escribir a las reglas reales del emulador. Si cambiás
 *     LIMITES_POR_PLAN.gratis y olvidás firestore.rules, el test falla.
 *
 *  2. El test de las reglas puede importar una función pura sin
 *     arrastrar el SDK de Firebase ni necesitar un navegador.
 *
 *  3. Que el alta sea una función y no un updateDoc en el botón evita
 *     que alguien lo duplique con otros valores en otro lado.
 */
export function nuevoDocumentoOrganizador(
  uid: string,
  email: string,
  nombre: string,
): Organizador {
  return {
    uid,
    email,
    nombre,
    fechaAlta: new Date(),
    // Sólo el gratis es elegible; el resto lo asigna el super-admin.
    plan: 'gratis',
    estadoSuscripcion: 'activo',
    brandingPanel: {
      logoUrl: null,
      colorPrimario: null,
      colorSecundario: null,
    },
    // Copia profunda: sin esto un update mutaría la tabla global.
    limitesPersonalizacion: { ...LIMITES_POR_PLAN.gratis },
  }
}
