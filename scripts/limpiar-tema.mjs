#!/usr/bin/env node
/**
 * Limpia el campo `personalizacion.tema` (presets eliminados).
 *
 * Los presets se sacaron del código, pero los documentos viejos pueden
 * traer la llave. Es inofensiva (nadie la lee), pero ensucia el modelo:
 * este script la borra con `FieldValue.delete()`.
 *
 * Uso:
 *   npm run emuladores                                  # terminal 1
 *   node scripts/limpiar-tema.mjs                       # dry-run contra emulador
 *   GOOGLE_APPLICATION_CREDENTIALS=./clave.json node scripts/limpiar-tema.mjs --apply --project <id>
 *                                                       # real, con service account
 */

import { readFileSync, existsSync } from 'node:fs'
import admin from 'firebase-admin'

const APLICAR = process.argv.includes('--apply')
const proyectoFlag = process.argv.indexOf('--project')
const PROJECT_ID = proyectoFlag !== -1 ? process.argv[proyectoFlag + 1] : 'easyeventqr-dev'

if (!process.env.FIRESTORE_EMULATOR_HOST && !APLICAR) {
  console.error('')
  console.error('  Sin emulador ni --apply no hago nada. Prendé `npm run emuladores`')
  console.error('  o pasá --apply con credencial (ver arriba).')
  console.error('')
  process.exit(1)
}

if (APLICAR) {
  const ruta = process.env.GOOGLE_APPLICATION_CREDENTIALS
  const crudo = process.env.FIREBASE_SERVICE_ACCOUNT
  if (ruta && existsSync(ruta)) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(ruta, 'utf8'))),
      projectId: PROJECT_ID,
    })
  } else if (crudo) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(crudo)),
      projectId: PROJECT_ID,
    })
  } else {
    console.error('  --apply necesita GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT.')
    process.exit(1)
  }
} else {
  admin.initializeApp({ projectId: PROJECT_ID })
}

const db = admin.firestore()
const snap = await db.collection('eventos').get()
const conTema = snap.docs.filter((d) => d.get('personalizacion.tema') !== undefined)

console.log(`  eventos: ${snap.size}, con personalizacion.tema: ${conTema.length}`)
for (const d of conTema.slice(0, 20)) console.log(`   - ${d.id}`)

if (!APLICAR) {
  console.log('  dry-run: nada escrito. Agregá --apply para borrar de verdad.')
  process.exit(0)
}

let borrados = 0
for (const d of conTema) {
  await d.ref.update({ 'personalizacion.tema': admin.firestore.FieldValue.delete() })
  borrados++
}
console.log(`  listo: ${borrados} documentos limpiados.`)
