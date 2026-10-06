/**
 * Cuánto se le permite pedir a una misma IP antes de cortar.
 *
 * MÓDULO HOJA A PROPÓSITO: ver el comentario de api/lib/qr.ts sobre por
 * qué los módulos de api/lib/ no se importan entre sí.
 *
 * PUREO A PROPÓSITO. Esto no habla con Firestore: recibe el contador que
 * leyó el endpoint y devuelve la decisión. Así se testea con `Date.now()`
 * simulado, en microsegundos y sin emulador, que es la misma razón por la
 * que `documentoEvento.ts` no importa nada de Firebase. La lectura y la
 * escritura del documento quedan en el endpoint, que es lo único que
 * necesita la credencial.
 */

const MINUTO = 60_000
const HORA = 3_600_000
const DIA = 86_400_000

/** El estado guardado en /rateLimit/{hash de la IP}. */
export interface Contador {
  /** Requests en la ventana del minuto. */
  pedidos: number
  /** Mails enviados en la ventana de la hora. */
  enviosHora: number
  /** Mails enviados en la ventana del día. */
  enviosDia: number
  /** Epoch ms del arranque de cada ventana. */
  desdeMinuto: number
  desdeHora: number
  desdeDia: number
}

export interface Configuracion {
  pedidosPorMinuto: number
  enviosPorHora: number
  enviosPorDia: number
}

/**
 * Los números, y por qué son estos y no otros.
 *
 * `enviosPorHora` y `enviosPorDia` son los que protegen la cuota de
 * Gmail (unos 500 mails por día por cuenta). Cada reserva aceptada es
 * un envío, así que el número que hay que proteger no es el tráfico:
 * es el correo. Un límite alto de requests no protege nada que
 * importe.
 *
 * `pedidosPorMinuto` es deliberadamente alto porque los operadores
 * móviles dan CGNAT: cincuenta personas registrando desde el wifi de un
 * salón de Hacking es un caso real, no un abuso. Con un límite de cinco
 * por minuto, un curso entero anotándose a la vez se traba y la culpa
 * parece del producto. Sesenta por minuto corta al script y no corta a
 * la familia.
 */
export const LIMITES_POR_DEFECTO: Configuracion = {
  pedidosPorMinuto: 60,
  enviosPorHora: 10,
  enviosPorDia: 30,
}

export type Motivo = 'ok' | 'pedidos' | 'envios-hora' | 'envios-dia'

export interface Decision {
  permitido: boolean
  motivo: Motivo
  /** El contador como queda si se acepta. */
  siguiente: Contador
  /**
   * Si hay que ESCRIBIR el documento en Firestore.
   *
   * Esto es lo que hace que el limitador no se convierta en el vector de
   * denegación de servicio del proyecto. Firestore en plan Spark da
   * 20.000 escrituras por día y 50.000 lecturas: si el limitador
   * escribiera en cada request, 20.000 requests de un spammer agotarían
   * la cuota de escrituras y frenarían el producto entero, no al
   * spammer. Con esta bandera, el que ya está sobre el límite lee y se
   * va sin escribir, así que el spam quema lecturas, que tienen 2,5
   * veces de margen.
   */
  escribir: boolean
}

const CERO: Contador = { pedidos: 0, enviosHora: 0, enviosDia: 0, desdeMinuto: 0, desdeHora: 0, desdeDia: 0 }

/**
 * Decide si esta request pasa, y cómo queda el contador.
 *
 * `actual` es null cuando todavía no hay documento para esa IP, que es
 * el primer request.
 *
 * Las tres ventanas se calculan por separado y no como una sola: el
 * tope del día tiene que sobrevivir a que se abra la ventana de la hora.
 * Si `enviosDia` se reiniciara junto con `enviosHora`, mandar 10 mails
 * por hora alcanzaría el "tope" del día cinco veces y el límite diario
 * no limitaría nada.
 *
 * Cuando algo está sobre el límite, `siguiente` devuelve el contador SIN
 * tocar. No es que el endpoint lo ignore: es que esa request no se
 * cuenta, y contarla sin poder hacer nada sería gastar la escritura
 * justo en el caso que no hay que gastarla.
 */
export function evaluarCupo(
  actual: Contador | null,
  ahora: number,
  config: Configuracion = LIMITES_POR_DEFECTO,
): Decision {
  const base = actual ?? { ...CERO, desdeMinuto: ahora, desdeHora: ahora, desdeDia: ahora }

  const minutoVigente = ahora - base.desdeMinuto < MINUTO
  const horaVigente = ahora - base.desdeHora < HORA
  const diaVigente = ahora - base.desdeDia < DIA

  const siguiente: Contador = {
    pedidos: minutoVigente ? base.pedidos + 1 : 1,
    enviosHora: horaVigente ? base.enviosHora + 1 : 1,
    enviosDia: diaVigente ? base.enviosDia + 1 : 1,
    desdeMinuto: minutoVigente ? base.desdeMinuto : ahora,
    desdeHora: horaVigente ? base.desdeHora : ahora,
    desdeDia: diaVigente ? base.desdeDia : ahora,
  }

  if (siguiente.pedidos > config.pedidosPorMinuto) {
    return { permitido: false, motivo: 'pedidos', siguiente: base, escribir: false }
  }
  if (siguiente.enviosHora > config.enviosPorHora) {
    return { permitido: false, motivo: 'envios-hora', siguiente: base, escribir: false }
  }
  if (siguiente.enviosDia > config.enviosPorDia) {
    return { permitido: false, motivo: 'envios-dia', siguiente: base, escribir: false }
  }

  return { permitido: true, motivo: 'ok', siguiente, escribir: true }
}

/** Un mensaje que se pueda mostrar, sin revelar en cuál límite se cayó. */
export function mensajeDeMotivo(motivo: Motivo): string {
  switch (motivo) {
    case 'pedidos':
      return 'Demasiados pedidos seguidos. Probá de nuevo en un minuto.'
    case 'envios-hora':
    case 'envios-dia':
      return 'Desde esta conexión ya enviamos suficientes entradas. Probá más tarde.'
    case 'ok':
      return ''
  }
}
