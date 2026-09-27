#!/usr/bin/env node
/**
 * Convierte el service account de Firebase en algo que se pueda pegar
 * en Vercel sin romperlo.
 *
 * Por qué hace falta: la private_key del JSON trae saltos de línea
 * reales. Si copiás el archivo tal cual al panel de variables de Vercel
 * a veces se pegan mal (el portapapeles, el navegador, el CMD) y la
 * función falla con un error de clave inválida que no dice nada útil.
 *
 * Este script lo aplana a una sola línea escapando los \n. Cuando el
 * backend hace JSON.parse(), los \n vuelven a ser saltos de línea reales
 * y la librería criptográfica los acepta.
 *
 * Uso:
 *   node scripts/preparar-service-account.mjs ~/Descargas/proyecto.json
 *   node scripts/preparar-service-account.mjs ~/Descargas/proyecto.json --write
 *
 * Con --write además lo guarda en .env.local para desarrollo.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [, , ruta, bandera] = process.argv

if (!ruta) {
  console.error('Falta la ruta del JSON. Ejemplo:')
  console.error('  node scripts/preparar-service-account.mjs ~/Descargas/easyeventqr.json\n')
  process.exit(1)
}

if (!existsSync(ruta)) {
  console.error(`No existe el archivo: ${ruta}`)
  process.exit(1)
}

let datos
try {
  datos = JSON.parse(readFileSync(ruta, 'utf8'))
} catch {
  console.error('El archivo no es JSON válido.')
  process.exit(1)
}

const problemas = []
if (datos.type !== 'service_account') problemas.push('falta "type": "service_account"')
if (!datos.project_id) problemas.push('falta project_id')
if (!datos.client_email) problemas.push('falta client_email')
if (!datos.private_key) problemas.push('falta private_key')

if (problemas.length > 0) {
  console.error('Este JSON no parece un service account de Firebase:')
  for (const p of problemas) console.error(`  - ${p}`)
  process.exit(1)
}

const valor = JSON.stringify(datos)

console.log('\n Service account válido')
console.log(`  archivo   ${basename(ruta)}`)
console.log(`  proyecto  ${datos.project_id}`)
console.log(`  cuenta    ${datos.client_email}`)
console.log(`  largo     ${valor.length} caracteres en una línea\n`)

if (bandera === '--write') {
  writeFileSync('.env.local', `FIREBASE_SERVICE_ACCOUNT='${valor}'\n`)
  console.log(' Guardado en .env.local (ya está en .gitignore)\n')
} else {
  console.log(' Pegá esto en Vercel → Settings → Environment Variables')
  console.log('   nombre: FIREBASE_SERVICE_ACCOUNT')
  console.log('   valor:  la línea de abajo\n')
  console.log('-' + '-'.repeat(78))
  console.log(valor)
  console.log('-' + '-'.repeat(78) + '\n')
}

console.log(' Cuando termines: borrá el .json de tu carpeta y poné el valor')
console.log(' en las variables de Vercel para Production y Preview.\n')
