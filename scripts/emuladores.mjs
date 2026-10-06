#!/usr/bin/env node
/**
 * Arranca los emuladores de Firebase con el JRE portable del proyecto.
 *
 * POR QUÉ ESTE SCRIPT
 * El emulador de Firestore está escrito en Java. Instalar un JDK en la
 * máquina es una modificación del sistema que no tiene nada que ver con
 * este repositorio, así que en su lugar hay un JRE portable descargado
 * en .tools/ (que no se versiona). Este script lo localiza y se lo pasa
 * a firebase-tools por la variable de entorno JAVA_HOME.
 *
 * Las variables se pasan por el entorno del proceso hijo, nunca por la
 * línea de comandos, así que no aparecen en `ps` ni en el historial del
 * shell.
 *
 * Uso:
 *   node scripts/emuladores.mjs            → sólo los emuladores + UI
 *   node scripts/emuladores.mjs test:rules → arranca, corre los tests y apaga
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CARPETA_JRE = join(RAIZ, '.tools')

/**
 * Busca el JRE portable en .tools (carpetas con prefijo "jdk-") y
 * devuelve su raíz, o null si no hay ninguno.
 */
function buscarJrePortable() {
  if (!existsSync(CARPETA_JRE)) return null

  const candidatos = readdirSync(CARPETA_JRE).filter((nombre) => nombre.startsWith('jdk-'))

  for (const nombre of candidatos) {
    const raiz = join(CARPETA_JRE, nombre)
    if (existsSync(join(raiz, 'bin', 'java'))) return raiz
  }

  return null
}

function mensajeFaltaJava() {
  return [
    '',
    '  No se encontró un JRE portable en .tools/',
    '',
    '  El emulador de Firestore necesita Java 21+. Para bajar una copia',
    '  dentro del proyecto (no toca el sistema):',
    '',
    '    mkdir -p .tools && cd .tools',
    '    curl -sL -o jre.tar.gz \\',
    '      "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse"',
    '    tar xzf jre.tar.gz && rm jre.tar.gz && cd ..',
    '',
    '  Si preferís usar el Java de tu sistema, alcanza con tener java en',
    '  el PATH; el script lo detecta.',
    '',
  ].join('\n')
}

const jrePortable = buscarJrePortable()

const entorno = { ...process.env }

// Si ya hay un java del sistema con versión suficiente, se respeta: el
// script no debe pisar el entorno de alguien que ya lo tiene bien.
if (jrePortable && !entorno.JAVA_HOME) {
  entorno.JAVA_HOME = jrePortable
  entorno.PATH = `${join(jrePortable, 'bin')}:${entorno.PATH ?? ''}`
}

const subcomando = process.argv[2] ?? 'servidor'

/**
 * firebase-tools toma el comando de emulators:exec como UN solo
 * argumento, no como varios: por eso va "node --test ..." joined en
 * una cadena y no como un array.
 */
const MODOS = {
  // Levanta los emuladores y se queda en primer plano, con la UI web.
  servidor: {
    emulators: ['emulators:start', '--only', 'firestore,auth'],
    comando: null,
  },
  // emulators:exec levanta, corre el comando, y baja los emuladores
  // solo. Es el modo que usan los tests: si el comando falla, el
  // proceso también, y no queda ningún emulador huérfano corriendo.
  // --test-concurrency=1 es OBLIGATORIO acá, no una optimización.
  // Por defecto node --test corre cada archivo en su propio proceso
  // pero EN PARALELO, y los dos archivos comparten el mismo emulador:
  // el clearFirestore() de uno borra los datos que el otro acaba de
  // sembrar, y los tests fallan con NOT_FOUND sin que haya ningún bug
  // en las reglas. Serializando los archivos, cada uno siembra su base
  // y la usa sin interferencias.
  'test:rules': {
    emulators: ['emulators:exec', '--only', 'firestore'],
    comando: 'node --test --test-concurrency=1 --test-reporter=spec tests/rules/*.test.ts',
  },
  // Circuito E2E (scripts/e2e-circuito.mjs): reserva, cupo, validación por
  // hash y marcado atómico de usado, todo contra Firestore emulado.
  e2e: {
    emulators: ['emulators:exec', '--only', 'firestore'],
    comando: 'node scripts/e2e-circuito.mjs',
  },
}

const modo = MODOS[subcomando]

if (!modo) {
  console.error(`\n  Modo desconocido: ${subcomando}`)
  console.error(`  Modos disponibles: ${Object.keys(MODOS).join(', ')}\n`)
  process.exit(1)
}

if (!jrePortable && !entorno.JAVA_HOME) {
  console.error(mensajeFaltaJava())
  process.exit(1)
}

const argumentos = [
  ...modo.emulators,
  '--project',
  'easyeventqr-dev',
  ...(modo.comando ? [modo.comando] : []),
]

console.log('')
console.log(`  Modo:        ${subcomando}`)
console.log(`  Proyecto:    easyeventqr-dev (emulado, no toca el real)`)
console.log(`  Java:        ${entorno.JAVA_HOME ?? 'el del sistema'}`)
console.log(`  Firestore:   http://127.0.0.1:8080`)
console.log(`  UI emulador: http://127.0.0.1:4000`)
console.log('')

const proceso = spawn('npx', ['firebase-tools', ...argumentos], {
  cwd: RAIZ,
  env: entorno,
  stdio: 'inherit',
})

proceso.on('error', (error) => {
  console.error('\n  No se pudo lanzar firebase-tools:', error.message)
  process.exit(1)
})

proceso.on('exit', (codigo) => {
  process.exit(codigo ?? 0)
})
