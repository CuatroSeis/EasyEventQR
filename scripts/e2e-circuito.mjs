#!/usr/bin/env node
/**
 * Circuito E2E contra el emulador: reserva → cupo → validación → uso atómico.
 *
 * Espeja la semántica de `api/registro.ts` (reserva + `reservas++` en la
 * MISMA transacción, con guarda de capacidad adentro) y de `api/validar.ts`
 * (el documento se busca por SHA-256 del token, y `usado` se marca en
 * transacción para que dos escaneos simultáneos no pasen los dos).
 *
 * Se corre con: node scripts/emuladores.mjs e2e
 * (emulators:exec levanta Firestore, corre esto y apaga todo solo).
 *
 * Lo que NO cubre (requiere sesión real, inbox y cámara): login con
 * Google, llegada del mail de Brevo, checkout simulado en el navegador y
 * escaneo físico. Esos pasos están en docs/arquitectura/ENDPOINTS.md.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { randomBytes, createHash } from 'node:crypto'

initializeApp({ projectId: 'easyeventqr-dev' })
const db = getFirestore()

const tokenDe = () => randomBytes(24).toString('base64url')
const hashDe = (t) => createHash('sha256').update(t).digest('hex')

let paso = 0
function ok(nombre) {
  paso += 1
  console.log(`  ✔ paso ${paso}: ${nombre}`)
}
function mal(nombre, causa) {
  console.error(`  ✘ paso ${paso + 1}: ${nombre}: ${causa}`)
  process.exit(1)
}

// Misma forma que api/registro.ts: crear la reserva e incrementar el
// contador en una sola transacción, con la guarda de capacidad adentro.
async function reservar(eventoId, nombre) {
  return db.runTransaction(async (tx) => {
    const refEvento = db.collection('eventos').doc(eventoId)
    const snap = await tx.get(refEvento)
    const ev = snap.data()
    if (ev.estado !== 'activo') throw new Error('cerrado')
    if (ev.reservas >= ev.capacidadMaxima) throw new Error('agotado')
    const token = tokenDe()
    const hash = hashDe(token)
    tx.set(db.collection('registros').doc(hash), {
      eventoId,
      nombre,
      email: `${nombre}@ejemplo.com`,
      qrHash: hash,
      estado: 'aprobado',
      pago: { requerido: false, estado: 'no_aplica' },
      usado: false,
      fechaRegistro: FieldValue.serverTimestamp(),
      fechaUso: null,
    })
    tx.update(refEvento, { reservas: ev.reservas + 1 })
    return token
  })
}

// Misma forma que api/validar.ts: marcar usado en transacción.
async function marcarUsado(token, eventoId) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('registros').doc(hashDe(token))
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('REGISTRO_NO_EXISTE')
    const reg = snap.data()
    if (reg.eventoId !== eventoId) throw new Error('EVENTO_INCORRECTO')
    if (reg.usado) throw new Error('YA_USADO')
    if (reg.estado !== 'aprobado') throw new Error('RESERVA_NO_VALIDA')
    tx.update(ref, { usado: true, fechaUso: FieldValue.serverTimestamp() })
    return true
  })
}

const eventoId = 'e2e-fase-c'
await db.collection('eventos').doc(eventoId).set({
  organizadorId: 'e2e-org',
  nombre: 'Evento E2E',
  capacidadMaxima: 2,
  reservas: 0,
  estado: 'activo',
})
ok('evento de prueba con capacidad 2')

const t1 = await reservar(eventoId, 'ana').catch((e) => mal('primera reserva', e.message))
const t2 = await reservar(eventoId, 'beto').catch((e) => mal('segunda reserva', e.message))
ok('dos reservas consumen el cupo')

const snapEv = await db.collection('eventos').doc(eventoId).get()
if (snapEv.data().reservas !== 2) mal('contador de cupo', `reservas=${snapEv.data().reservas}, esperado 2`)
ok('Evento.reservas == 2')

try {
  await reservar(eventoId, 'carlos')
  mal('tercera reserva sobre cupo lleno', 'entró cuando debía dar agotado')
} catch (e) {
  if (e.message !== 'agotado') mal('tercera reserva sobre cupo lleno', `dio ${e.message}`)
}
ok('tercera reserva da agotado (capacidad adentro de la transacción)')

if (!(await db.collection('registros').doc(hashDe(t1)).get()).exists) {
  mal('validación por hash', 'el documento no aparece por su SHA-256')
}
if ((await db.collection('registros').doc(hashDe(tokenDe())).get()).exists) {
  mal('validación por hash', 'un token inventado encontró documento')
}
ok('validar es un get por SHA-256, no una query')

await marcarUsado(t1, eventoId).catch((e) => mal('primer escaneo', e.message))
try {
  await marcarUsado(t1, eventoId)
  mal('segundo escaneo del mismo QR', 'pasó dos veces')
} catch (e) {
  if (e.message !== 'YA_USADO') mal('segundo escaneo del mismo QR', `dio ${e.message}`)
}
ok('el mismo QR pasa una sola vez (409 ya usado)')

// Dos escaneos EN PARALELO del otro token: la transacción serializa y
// exactamente uno tiene que ganar.
const resultados = await Promise.allSettled([
  marcarUsado(t2, eventoId),
  marcarUsado(t2, eventoId),
])
const ganados = resultados.filter((r) => r.status === 'fulfilled').length
const perdidosYaUsado = resultados.filter(
  (r) => r.status === 'rejected' && r.reason?.message === 'YA_USADO',
).length
if (ganados !== 1 || perdidosYaUsado !== 1) {
  mal('doble escaneo simultáneo', `ganados=${ganados} ya_usado=${perdidosYaUsado}, esperado 1 y 1`)
}
ok('doble escaneo simultáneo: uno pasa, el otro ve ya usado')

console.log('')
console.log(`  Circuito E2E contra emulador: ${paso} pasos OK`)
