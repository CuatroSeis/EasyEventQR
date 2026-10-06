#!/usr/bin/env node
/**
 * Backfill de eventos creados antes del código corto.
 *
 * Agrega `codigoCorto`, `slug`, `nombreNormalizado` y `visibilidad` a los
 * documentos de /eventos que no los tengan. Escribe con `update` (nunca
 * `set` sin merge) para no pisar nada.
 *
 * Lo que NO hace, a propósito:
 * - No renombra IDs: copiar docs a IDs nuevos rompería `registros.eventoId`.
 *   El código queda como campo y los endpoints ya resuelven por campo
 *   (fallback en buscar.ts y evento-publico.ts).
 * - No publica nada: `visibilidad` nace en 'privado'. El organizador
 *   decide qué mostrar en el buscador desde el formulario.
 *
 * Uso:
 *   node scripts/backfill-eventos.mjs            # dry-run, solo muestra
 *   node scripts/backfill-eventos.mjs --apply   # escribe de verdad
 *
 * Credenciales: GOOGLE_APPLICATION_CREDENTIALS (ruta al JSON del service
 * account) o FIREBASE_SERVICE_ACCOUNT (JSON minificado en una variable).
 */

import { readFileSync } from 'node:fs'
import admin from 'firebase-admin'

const APLICAR = process.argv.includes('--apply')
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function codigoAleatorio() {
  let r = ''
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  for (let i = 0; i < 6; i++) r += CHARS[buf[i] % CHARS.length]
  return r
}

function credenciales() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  }
  console.error('Falta GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT.')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.cert(credenciales()) })
const db = admin.firestore()

const snap = await db.collection('eventos').get()
const viejos = snap.docs.filter((d) => {
  const data = d.data()
  return !data.codigoCorto || !data.slug || !data.nombreNormalizado || !data.visibilidad
})

console.log(`Eventos totales: ${snap.size}. Para migrar: ${viejos.length}. Modo: ${APLICAR ? 'APPLY' : 'DRY-RUN'}`)

let migrados = 0
for (const docSnap of viejos) {
  const data = docSnap.data()
  const nombre = String(data.nombre ?? '')

  // Código único: si el campo ya existe en otro doc, se regenera.
  let codigoCorto = data.codigoCorto
  if (!codigoCorto) {
    for (let i = 0; i < 5; i++) {
      const candidato = codigoAleatorio()
      const choque = await db.collection('eventos').where('codigoCorto', '==', candidato).limit(1).get()
      if (choque.empty) {
        codigoCorto = candidato
        break
      }
    }
    if (!codigoCorto) {
      console.error(`  ✖ ${docSnap.id}: no se pudo generar código único, se saltea`)
      continue
    }
  }

  const cambios = {
    codigoCorto,
    slug: data.slug || `${normalizarTexto(nombre) || 'evento'}-${Math.random().toString(36).slice(2, 6)}`,
    nombreNormalizado: data.nombreNormalizado || normalizarTexto(nombre),
    visibilidad: data.visibilidad || 'privado',
  }

  if (APLICAR) {
    await docSnap.ref.update(cambios)
    console.log(`  ✔ ${docSnap.id} → ${cambios.codigoCorto} / ${cambios.slug} / ${cambios.visibilidad}`)
  } else {
    console.log(`  · ${docSnap.id} migraría a: ${JSON.stringify(cambios)}`)
  }
  migrados++
}

console.log(`Listo: ${migrados} eventos ${APLICAR ? 'migrados' : 'por migrar (dry-run, sin cambios)'}.`)
process.exit(0)
