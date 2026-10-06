#!/usr/bin/env node
/**
 * Asigna (o quita) el custom claim `admin` de un usuario.
 *
 *   npm run auth:admin -- <email>
 *   npm run auth:admin -- <email> --quitar
 *
 * El claim vive en el ID token (sólo el Admin SDK lo escribe) y recién
 * aparece al reemitirse: después de correr esto hay que volver a entrar.
 *
 * REQUISITOS
 *   - FIREBASE_SERVICE_ACCOUNT con el JSON del service account, en una
 *     sola línea (ver scripts/preparar-service-account.mjs).
 *   - El service account con permiso "Authentication Admin" en IAM.
 */

import { cert, getAuth } from 'firebase-admin/auth'
import { initializeApp } from 'firebase-admin/app'

const [, , email, ...resto] = process.argv
const quitar = resto.includes('--quitar')

if (!email || email.startsWith('-')) {
  console.error(`
  Uso:
    npm run auth:admin -- <correo@ejemplo.com>
    npm run auth:admin -- <correo@ejemplo.com> --quitar
`)
  process.exit(1)
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT

if (!serviceAccount) {
  console.error(`
  Falta la variable FIREBASE_SERVICE_ACCOUNT.

  Pasala en la misma línea, sin comillas ni saltos, para que no quede
  en el historial del shell:

    FIREBASE_SERVICE_ACCOUNT="$(cat rufino.json | jq -c .)" npm run auth:admin -- ${email}

  Para conseguirla: Firebase console → Project Settings → Service
  Accounts → Generate new private key. Ojo: el JSON se descarga una sola
  vez.
`)
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
const auth = getAuth()

try {
  const usuario = await auth.getUserByEmail(email)

  if (quitar) {
    await auth.setCustomUserClaims(usuario.uid, { admin: false })
    console.log(`\n  Quitado el claim admin de ${email} (${usuario.uid}).`)
  } else {
    // OJO con esto: setCustomUserClaims REEMPLAZA todos los claims del
    // usuario, no los agrega. Por eso el objeto tiene que llevar el
    // resto de los claims que ya tenía. Acá sólo existe `admin`, pero
    // si mañana se agrega otro claim (por ejemplo `organizadorId`),
    // hay que leer los actuales con getUser() y mergearlos, o al
    // próximo login se pierde el que falte y el usuario pierde
    // permisos sin que nadie se entere.
    await auth.setCustomUserClaims(usuario.uid, { admin: true })
    console.log(`\n  Claim admin asignado a ${email} (${usuario.uid}).`)
  }

  console.log(`
  Próximo paso: cerrá sesión y volvé a entrar. El token actual del
  usuario no cambia solo, así que hasta que entre de nuevo las reglas
  siguen viéndolo sin permiso de admin.
`)
} catch (error) {
  // Sin "as { code }" porque esto es un .mjs: el linter lo parsea como
  // JavaScript y la sintaxis de TypeScript ahí no compila.
  const codigo = error?.code ?? ''
  if (codigo === 'auth/user-not-found') {
    console.error(`\n  No existe ningún usuario con el correo ${email}.`)
    console.error('  El usuario tiene que haber entrado al menos una vez a /entrar.')
  } else if (codigo === 'auth/invalid-credential' || codigo === 'auth/invalid-certificate') {
    console.error('\n  Las credenciales del service account no son válidas o no tienen')
    console.error('  permiso de Authentication Admin.')
  } else {
    console.error('\n  Error:', error?.message ?? error)
  }
  process.exit(1)
}
