/**
 * Modelo de datos — espejo de las colecciones de Firestore.
 *
 * Estas interfaces son la documentación ejecutable del modelo: si un
 * documento de Firestore tiene una forma, la tiene acá. Los tipos más
 * delicados son `Plan` y `EstadoRegistro`, que se usan como unión de
 * literales justamente para que TypeScript no deje pasar un estado inventado.
 */

/** Nivel de suscripción del organizador. El super-admin lo asigna. */
export type Plan = 'gratis' | 'pro' | 'pro+'

export type EstadoSuscripcion = 'activo' | 'suspendido'

/** Los interruptores que controlan qué personalización se puede usar. */
export interface LimitesPersonalizacion {
  bannerPermitido: boolean
  colorPersonalizadoPermitido: boolean
  logoPermitido: boolean
  /**
   * Tope de entradas que puede tener UN evento.
   *
   * Va en el documento del organizador y no en la tabla de planes para
   * que el super-admin pueda Exceptuar a un cliente sin redeployar: si
   * estuviera sólo en LIMITES_POR_PLAN habría que tocar código y volver
   * a desplegar por cada excepción comercial.
   *
   * Lo valida la regla del create de /eventos, leyendo estos mismos
   * campos con un get(). O sea que el límite no depende de que el
   * cliente se porte bien: sin esto, un plan gratis puede crear un
   * evento de un millón de entradas desde la consola.
   */
  capacidadMaximaPorEvento: number
}

/**
 * Límites por plan.
 *
 * FácilEventQR vive en un solo lugar. El super-admin NO edita esta tabla:
 * edita el `limitesPersonalizacion` guardado en el documento del organizador
 * (por si hay excepciones comerciales). Esta tabla es la que se aplica
 * al crear una cuenta nueva. Así se puede dar un plan distinto a un
 * cliente puntual sin tocar código ni redeployar.
 *
 * Los números de capacidad son decisión comercial, no técnica: 100
 * entradas para el plan gratis es lo que entra cómodo en el envío de
 * mails de Brevo del mes (300/día) y en la planilla del organizador.
 * Cuando el precio cambie, cambian los dos lados —esta tabla y
 * firestore.rules— y los tests avisan.
 */
export const LIMITES_POR_PLAN: Record<Plan, LimitesPersonalizacion> = {
  gratis: {
    bannerPermitido: false,
    colorPersonalizadoPermitido: true,
    logoPermitido: false,
    capacidadMaximaPorEvento: 100,
  },
  pro: {
    bannerPermitido: true,
    colorPersonalizadoPermitido: true,
    logoPermitido: false,
    capacidadMaximaPorEvento: 1_000,
  },
  'pro+': {
    bannerPermitido: true,
    colorPersonalizadoPermitido: true,
    logoPermitido: true,
    capacidadMaximaPorEvento: 5_000,
  },
}

export interface Organizador {
  nombre: string
  email: string
  uid: string
  fechaAlta: Date
  plan: Plan
  estadoSuscripcion: EstadoSuscripcion
  telefono?: string
  descripcion?: string
  redesSociales?: {
    instagram?: string
    twitter?: string
    linkedin?: string
    web?: string
  }
  /** Landing pública: copy por defecto (el evento puede sobreescribirlo). */
  textoBienvenida?: string | null
  textoConfirmacion?: string | null
  brandingPanel: {
    logoUrl: string | null
    colorPrimario: string | null
    colorSecundario: string | null
  }
  limitesPersonalizacion: LimitesPersonalizacion
}

export type EstadoEvento = 'activo' | 'cerrado'

export interface PersonalizacionEvento {
  bannerUrl: string | null
  logoUrl: string | null
  colorPrimario: string | null
  colorSecundario: string | null
  textoBienvenida: string | null
  textoConfirmacion: string | null
}

export interface Evento {
  organizadorId: string
  nombre: string
  fecha: Date
  lugar: string
  descripcion: string
  capacidadMaxima: number
  /**
   * Cuántas reservas se emitieron para este evento.
   *
   * Es el contador que hace posible la transacción de la Fase 3: el
   * cupo se valida comparando este número contra `capacidadMaxima`, y las
   * dos escrituras (crear la reserva e incrementar el contador) van en la
   * MISMA transacción. Sin el contador habría que contar documentos, y las
   * reglas de Firestore no pueden contar (y `count()` no es confiable
   * adentro de una transacción).
   *
   * IMPORTANTE: lo escribe el servidor con el Admin SDK. Un organizador
   * con permiso de update sobre su evento NO lo puede tocar, y eso lo
   * asegura la regla `noCambiaReservas()` comparando contra el valor
   * actual. Si no estuviera protegido, abriría su propio evento con
   * `updateDoc(..., { reservas: -1000 })` desde la consola.
   *
   * Cuenta reservas EMITIDAS, no vivas: el organizador puede borrar un
   * registro y el contador no baja. Es el nombre honesto del número. El
   * uncontado en lote es pendiente de la Fase 6.
   */
  reservas: number
  estado: EstadoEvento
  requierePago: boolean
  precioEntrada: number | null
  personalizacion: PersonalizacionEvento
  /** Código corto y único del evento (ej. "FEST-8K2P"). Generado por el backend. */
  codigoCorto: string
  /** Nombre normalizado para búsqueda por prefijo. */
  nombreNormalizado: string
  /** Slug legible para URL pública (ej. "festival-rock-2026"). Generado por el backend. */
  slug: string
  /** Si es 'publico', aparece en búsqueda por nombre. Si es 'privado', solo por link directo. */
  visibilidad: 'publico' | 'privado'
}

export type EstadoRegistro = 'pendiente' | 'aprobado' | 'rechazado'
export type EstadoPago = 'no_aplica' | 'pendiente' | 'pagado' | 'rechazado'

export interface Pago {
  requerido: boolean
  estado: EstadoPago
  montoPagado: number | null
  medioPago: string | null
  idTransaccion: string | null
  fechaPago: Date | null
}

/**
 * `usado` es el campo que hace la validación de entrada en la puerta.
 * Lo escribe una transacción (Fase 7) y no un update normal, justamente
 * para que dos escaneos simultáneos no puedan pasarlo los dos.
 */
export interface Registro {
  eventoId: string
  nombre: string
  email: string
  telefono: string
  dni: string
  fechaNacimiento: string
  /**
   * El SHA-256 del token del QR, en hexadecimal.
   *
   * OJO con el nombre, porque antes decía `qrCode` y mentía: el token en
   * claro NO está en Firestore, sale una sola vez por mail y no se
   * regenera. Lo que queda acá es su huella, y `qrHash` dice eso sin
   * ambigüedad (un `grep qrCode` ya no sugiere que haya un QR guardado).
   *
   * El token son 192 bits de `crypto.randomBytes(24)` en base64url. La
   * huella viaja ADEMÁS como ID del documento, así que la validación es
   * un `getDoc` en vez de un `query` y el doble registro es imposible
   * por construcción: los IDs de Firestore son únicos.
   */
  qrHash: string
  /**
   * Cuándo se emitió el token que hay en claro.
   *
   * Solo se escribe al reenviar: el alta lo emite una vez y acá queda la
   * marca. Sirve para que el organizador vea que un reenvío ROTÓ el token
   * (y por lo tanto dejó muerto el QR del mail anterior) en vez de haber
   * reenviado el mismo. `null` significa "el del alta, nunca reenviado".
   */
  tokenEmitidoEn?: Date | null
  /**
   * Lápida de rotación: si existe, este documento ya no es una entrada
   * sino un puntero al documento nuevo. La validación busca por ID
   * (= hash del token), así que rotar sólo el campo `qrHash` no rota
   * nada: hay que crear un documento nuevo y dejar acá a dónde mudarse.
   */
  reemplazadoPor?: string
  estado: EstadoRegistro
  pago: Pago
  usado: boolean
  fechaRegistro: Date
  fechaUso: Date | null
}
