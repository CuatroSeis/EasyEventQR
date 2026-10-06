#!/usr/bin/env node
/**
 * Seed de demo: datos de ejemplo para recorrer el producto sin cuentas.
 *
 * Crea un organizador, dos eventos (uno gratis y uno pago) y tres
 * reservas en estados distintos, e imprime las URLs para verificar:
 * landing pública, QR válido, QR ya usado y QR pendiente.
 *
 * Los tokens se generan acá y se imprimen acá: es el único momento en
 * que existen en claro (en Firestore solo queda el SHA-256, como en
 * producción). Guardá la salida si querés reusar los links.
 *
 * SOLO EMULADOR. Se niega a correr sin FIRESTORE_EMULATOR_HOST, para
 * que un seed de mentira no termine nunca en la base real.
 *
 * Uso (dos terminales):
 *   1. npm run emuladores
 *   2. npm run demo:seed
 *   3. npm run dev:api   (o vercel dev) → abrir las URLs impresas
 *
 * Las formas de los documentos espejan `nuevoDocumentoOrganizador()`,
 * `nuevoDocumentoEvento()` y el alta de `api/registro.ts`. Si esos
 * cambian, este script queda viejo a propósito y hay que actualizarlo.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { randomBytes, createHash } from 'node:crypto'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('')
  console.error('  Solo emulador: prendé `npm run emuladores` y corré esto')
  console.error('  en otra terminal con el emulador levantado.')
  console.error('')
  process.exit(1)
}

initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'easyeventqr-dev' })
const db = getFirestore()

const BASE = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const tokenDe = () => randomBytes(24).toString('base64url')
const hashDe = (t) => createHash('sha256').update(t).digest('hex')

const ORG_ID = 'demo-org'
await db.collection('organizadores').doc(ORG_ID).set({
  uid: ORG_ID,
  email: 'demo@easyeventqr.ejemplo',
  nombre: 'Organización Demo',
  fechaAlta: FieldValue.serverTimestamp(),
  plan: 'gratis',
  estadoSuscripcion: 'activo',
  brandingPanel: { logoUrl: null, colorPrimario: '#7c3aed', colorSecundario: null },
  limitesPersonalizacion: {
    bannerPermitido: false,
    colorPersonalizadoPermitido: true,
    logoPermitido: false,
    capacidadMaximaPorEvento: 100,
  },
})

const enDias = (n) => Timestamp.fromDate(new Date(Date.now() + n * 86_400_000))

async function crearEvento(id, datos) {
  await db.collection('eventos').doc(id).set({
    organizadorId: ORG_ID,
    reservas: 0,
    estado: 'activo',
    personalizacion: {
      bannerUrl: null,
      logoUrl: null,
      colorPrimario: '#7c3aed',
      colorSecundario: null,
      textoBienvenida: '¡Te esperamos! Traé esta entrada en el celular, con brillo alto.',
      textoConfirmacion: 'Tu lugar quedó reservado.',
    },
    codigoCorto: `DEMO-${id.slice(-4).toUpperCase()}`,
    nombreNormalizado: datos.nombre.toLowerCase(),
    slug: datos.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    visibilidad: 'publico',
    ...datos,
    fecha: enDias(7),
  })
}

await crearEvento('demo-asado', {
  nombre: 'Asado de fin de año (demo)',
  lugar: 'Club El Galpón',
  descripcion: 'Evento gratuito de ejemplo: anotate y probá el QR.',
  capacidadMaxima: 100,
  requierePago: false,
  precioEntrada: null,
})

await crearEvento('demo-curso', {
  nombre: 'Curso de parrilla nivel 1 (demo)',
  lugar: 'Aula 3',
  descripcion: 'Evento pago de ejemplo para probar el checkout simulado.',
  capacidadMaxima: 50,
  requierePago: true,
  precioEntrada: 2500,
})

async function crearRegistro(eventoId, datos, token) {
  const hash = hashDe(token)
  await db.collection('registros').doc(hash).set({
    eventoId,
    telefono: '',
    qrHash: hash,
    fechaRegistro: FieldValue.serverTimestamp(),
    fechaUso: null,
    ipHash: 'demo',
    ...datos,
  })
  return hash
}

const tValido = tokenDe()
const tUsado = tokenDe()
const tPendiente = tokenDe()

await crearRegistro('demo-asado', {
  nombre: 'Ana Demo',
  email: 'ana@ejemplo.com',
  dni: '30111222',
  fechaNacimiento: '1990-05-01',
  estado: 'aprobado',
  pago: { requerido: false, estado: 'no_aplica', montoPagado: null, medioPago: null, idTransaccion: null, fechaPago: null },
  usado: false,
}, tValido)

await crearRegistro('demo-asado', {
  nombre: 'Beto Demo',
  email: 'beto@ejemplo.com',
  dni: '29222333',
  fechaNacimiento: '1988-11-20',
  estado: 'aprobado',
  pago: { requerido: false, estado: 'no_aplica', montoPagado: null, medioPago: null, idTransaccion: null, fechaPago: null },
  usado: true,
  fechaUso: FieldValue.serverTimestamp(),
}, tUsado)

await crearRegistro('demo-curso', {
  nombre: 'Carla Demo',
  email: 'carla@ejemplo.com',
  dni: '28333444',
  fechaNacimiento: '1992-02-14',
  estado: 'pendiente',
  pago: { requerido: true, estado: 'pendiente', montoPagado: null, medioPago: null, idTransaccion: null, fechaPago: null },
  usado: false,
}, tPendiente)

await db.collection('eventos').doc('demo-asado').set({ reservas: 2 }, { merge: true })
await db.collection('eventos').doc('demo-curso').set({ reservas: 1 }, { merge: true })

console.log('')
console.log('  Demo lista. Recorrido sin cuentas (con `npm run dev:api` corriendo):')
console.log('')
console.log(`  1. Landing gratis:  ${BASE}/e/demo-asado`)
console.log(`  2. Landing paga:    ${BASE}/e/demo-curso`)
console.log(`  3. QR válido:       ${BASE}/q/${tValido}?eventoId=demo-asado`)
console.log(`  4. QR ya usado:     ${BASE}/q/${tUsado}?eventoId=demo-asado`)
console.log(`  5. QR pendiente:    ${BASE}/q/${tPendiente}?eventoId=demo-curso`)
console.log('  6. Widget:          pegá <ticket-widget evento-id="demo-asado"> con')
console.log('                      <script src="http://localhost:5173/widget/widget.js"></script>')
console.log('                      (o la URL de tu deploy) en cualquier HTML.')
console.log('')
console.log('  El panel (/panel) y /admin sí piden sesión: esa parte no es demo.')
console.log('')
