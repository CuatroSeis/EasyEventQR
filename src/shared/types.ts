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

/** Los 3 interruptores que controlan qué personalización se puede usar. */
export interface LimitesPersonalizacion {
  bannerPermitido: boolean
  colorPersonalizadoPermitido: boolean
  logoPermitido: boolean
}

/**
 * Límites por plan.
 *
 * FácilEventQR vive en un solo lugar. El super-admin NO edita esta tabla:
 * edita el `limitesPersonalizacion` guardado en el documento del organizador
 * (por si hay excepciones comerciales). Esta tabla es la que se aplica
 * al crear una cuenta nueva. Así se puede dar un plan distinto a un
 * cliente puntual sin tocar código ni redeployar.
 */
export const LIMITES_POR_PLAN: Record<Plan, LimitesPersonalizacion> = {
  gratis: { bannerPermitido: false, colorPersonalizadoPermitido: true, logoPermitido: false },
  pro: { bannerPermitido: true, colorPersonalizadoPermitido: true, logoPermitido: false },
  'pro+': { bannerPermitido: true, colorPersonalizadoPermitido: true, logoPermitido: true },
}

export interface Organizador {
  nombre: string
  email: string
  uid: string
  fechaAlta: Date
  plan: Plan
  estadoSuscripcion: EstadoSuscripcion
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
  estado: EstadoEvento
  requierePago: boolean
  precioEntrada: number | null
  personalizacion: PersonalizacionEvento
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
  /** Viaja DENTRO del QR. Nunca datos personales: el QR no dice
   *  "Juan Pérez, juan@mail.com", dice sólo este identificador. */
  qrCode: string
  estado: EstadoRegistro
  pago: Pago
  usado: boolean
  fechaRegistro: Date
  fechaUso: Date | null
}
