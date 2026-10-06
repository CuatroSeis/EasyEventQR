import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'

import { getAdminAuth, getDb } from '../src/server/lib/firebase-admin.js'
import { capturarError } from '../src/server/lib/sentry.js'

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID

/** Tope de lotes de Firestore: 500 escrituras por batch, 400 por seguridad. */
const TOPE_LOTE = 400

/**
 * `/api/me` — quién es esta persona y qué puede hacer.
 *
 * La decisión de "es super-admin" tiene que ser la MISMA que toma
 * `api/admin-organizadores.ts`, porque son las dos mitades de la misma
 * puerta: esta dice si el panel se abre, y la otra revisa cada operación.
 * Si las dos no coinciden pasa algo que de entrada parece un bug de
 * permisos y en realidad es que no coinciden.
 *
 * Antes esta miraba sólo `SUPER_ADMIN_UID` y el claim `admin` lo ignoraba.
 * Con el claim puesto y la variable sin definir —que es lo que pasa en
 * cualquier entorno nuevo— el panel cerraba: `AdminPanel` preguntaba acá,
 * recibía `isAdmin: false` y expulsaba al super-admin al `/panel`. El
 * mensaje que ve el usuario no dice nada de permisos, y la respuesta
 * correcta (faltó una variable) queda escondida detrás.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // El uid sale del ID token verificado por Firebase, y de ningún otro
  // lado. Antes se aceptaba un header `x-user-uid` que mandaba el cliente
  // y eso convertía este endpoint en un "decime tu uid y te digo si sos
  // admin" para cualquiera: los headers son afirmaciones del cliente, no
  // credenciales.
  const authHeader = req.headers.authorization
  let uid: string | undefined
  let esAdminPorClaim = false

  if (authHeader?.startsWith('Bearer ')) {
    try {
      // `getAdminAuth()` y no `getAuth()` a secas: `getAuth()` sin argumentos
      // usa el app `[DEFAULT]`, que en una lambda no existe hasta que alguien
      // pide `getDb()` — y acá el primer `getDb()` está en la línea 87, con
      // la respuesta ya armada. Con `getAuth()` el `verifyIdToken` moría con
      // `app/no-app`, el `catch` de abajo lo comía, y respondía
      // `porQue: 'sin-sesion'` con la sesión perfectamente vigente. O sea: el
      // panel expulsaba al super-admin y el diagnóstico era una mentira.
      // El import de `firebase-admin/auth` sigue siendo dinámico adentro del
      // helper; ver el comentario de `getAdminAuth()` para por qué.
      const decoded = await (await getAdminAuth()).verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
      // Cuando el claim no existe, `decodificado.admin` no es `undefined`:
      // es una excepción al acceder, y la excepción se come el try y
      // termina pareciendo un token inválido. Se lee con el guard.
      esAdminPorClaim = decoded.admin === true
    } catch (error) {
      // Un `catch {}` mudo es lo que volvió este bug invisible: `app/no-app`
      // —un error de inicialización— salía como `sin-sesion`, que es un
      // diagnóstico sobre el login. Distinguir "el token vino mal" de "el
      // backend no pudo verificarlo" es lo primero que hay que poder ver, así
      // que se registra. El código y el mensaje de firebase-admin no llevan
      // secretos: el token no se imprime, sólo el motivo del rechazo.
      const codigo = (error as { code?: string }).code ?? 'sin-codigo'
      console.error(`[me] verifyIdToken falló: ${codigo} — ${(error as Error).message}`)
      // Token inválido o expirado: cae en el "no hay sesión" de abajo.
    }
  }

  if (!uid) {
    return res.status(200).json({
      ok: true,
      uid: null,
      isAdmin: false,
      porQue: 'sin-sesion',
      organizador: null,
    })
  }

  // El claim manda, y el UID por variable es la puerta de atrás. Es el
  // mismo criterio, en el mismo orden, que en `api/admin-organizadores.ts`.
  const esAdminPorUid = SUPER_ADMIN_UID !== undefined && uid === SUPER_ADMIN_UID
  const isAdmin = esAdminPorClaim || esAdminPorUid

  // `porQue` no sirve para autorizar: es sólo para que la UI pueda explicar
  // el rechazo. Sin esto el panel expulsa sin decir por qué y el usuario
  // no tiene forma de saber si le falta la claim, la variable, o las dos.
  let porQue: string | null = null
  if (!isAdmin) {
    if (!SUPER_ADMIN_UID) {
      porQue = 'falta-var'
    } else if (uid !== SUPER_ADMIN_UID) {
      porQue = 'sin-claim'
    } else {
      porQue = 'desconocido'
    }
  }

  // Si es admin, también devolvemos info del organizador
  let organizador = null
  if (isAdmin) {
    try {
      const db = getDb()
      const snap = await db.collection('organizadores').doc(uid).get()
      if (snap.exists) {
        organizador = { uid: snap.id, ...snap.data() }
      }
    } catch {
      // Ignorar errores de BD
    }
  }

  if (req.method === 'DELETE') {
    return await eliminarMiCuenta(res, uid)
  }

  return res.status(200).json({ ok: true, uid, isAdmin, porQue, organizador })
}

/**
 * DELETE /api/me — el usuario borra su propia cuenta con todo adentro.
 *
 * La baja pasa por el backend y no por deletes sueltos desde el cliente
 * por dos motivos: 1) son N documentos (eventos + registros) y un fallo
 * a mitad de camino desde el navegador deja basura huérfana; 2) la cuenta
 * de Auth sólo la puede borrar el Admin SDK.
 *
 * El orden importa: primero los registros de cada evento, después los
 * eventos, después el documento del organizador y ÚLTIMO el usuario de
 * Auth. Si el deleteUser fallara, los datos ya están borrados y la cuenta
 * queda vacía en vez de al revés (cuenta borrada con datos vivos que
 * nadie puede administrar).
 */
async function eliminarMiCuenta(res: VercelResponse, uid: string) {
  // La puerta de atrás no se auto-elimina por acá: sin SUPER_ADMIN_UID
  // no hay forma de recuperar el acceso de break-glass. Las cuentas de
  // super-admin se gestionan desde /admin.
  if (SUPER_ADMIN_UID !== undefined && uid === SUPER_ADMIN_UID) {
    return res.status(400).json({
      ok: false,
      error: 'Esa cuenta se elimina desde el panel de super-admin.',
    })
  }

  try {
    const db = getDb()
    let eliminados = 0

    const eventos = await db.collection('eventos').where('organizadorId', '==', uid).get()
    for (const docEvento of eventos.docs) {
      const registros = await db.collection('registros').where('eventoId', '==', docEvento.id).get()
      await eliminarEnLotes(
        db,
        registros.docs.map((d) => d.ref),
      )
      eliminados += registros.size
      await docEvento.ref.delete()
      eliminados += 1
    }

    await db.collection('organizadores').doc(uid).delete()
    eliminados += 1

    try {
      await (await getAdminAuth()).deleteUser(uid)
    } catch (error) {
      await capturarError(error, { ruta: '[me] no se pudo borrar la cuenta de Auth:' })
    }

    return res.status(200).json({ ok: true, eliminados })
  } catch (error) {
    await capturarError(error, { ruta: '[me] error eliminando cuenta:' })
    return res.status(500).json({ ok: false, error: 'No se pudo eliminar la cuenta.' })
  }
}

/** Borra en bloques: un batch de Firestore admite 500 escrituras, no más. */
async function eliminarEnLotes(db: Firestore, referencias: DocumentReference[]): Promise<void> {
  for (let i = 0; i < referencias.length; i += TOPE_LOTE) {
    const lote = referencias.slice(i, i + TOPE_LOTE)
    const batch = db.batch()
    for (const ref of lote) batch.delete(ref)
    await batch.commit()
  }
}