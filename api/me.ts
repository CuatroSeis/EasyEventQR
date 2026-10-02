import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getDb } from '@server/firebase-admin.js'
import { getAuth } from 'firebase-admin/auth'

const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID

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
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7))
      uid = decoded.uid
      // Cuando el claim no existe, `decodificado.admin` no es `undefined`:
      // es una excepción al acceder, y la excepción se come el try y
      // termina pareciendo un token inválido. Se lee con el guard.
      esAdminPorClaim = decoded.admin === true
    } catch {
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

  return res.status(200).json({ ok: true, uid, isAdmin, porQue, organizador })
}