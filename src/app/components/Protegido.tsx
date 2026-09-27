import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'

import { asegurarDocumentoOrganizador, observarSesion } from '../../services/auth'
import type { Organizador } from '../../shared/types'

/**
 * Guarda de rutas del panel.
 *
 * Recibe children como render prop y le pasa el documento del
 * organizador, que es el que acaba de leer. Así el panel no vuelve a
 * pedirlo y no queda un estado "cargando el organizador" duplicado en
 * dos componentes.
 *
 * Lo que NO hace, y es lo importante: no decide permisos. Que el usuario
 * esté logueado se comprueba acá porque es cómodo, pero el aislamiento
 * real entre organizadores está en firestore.rules. Si alguien borra
 * este componente o mete un <Link> al panel, lo que pasa es que ve una
 * pantalla con "cargando" y los datos no llegan: las reglas los cortan.
 * Un guarda de ruta es UX; las reglas son seguridad. Confundir las dos
 * cosas es el error clásico de este tipo de proyecto.
 */
export default function Protegido({
  children,
}: {
  children: (organizador: Organizador) => ReactNode
}) {
  const [estado, setEstado] = useState<'cargando' | 'autenticado' | 'anonimo'>('cargando')
  const [organizador, setOrganizador] = useState<Organizador | null>(null)
  const ubicacion = useLocation()

  useEffect(() => {
    // onAuthStateChanged devuelve la función de baja: sin este return,
    // en cada montaje de StrictMode quedaría una suscripción viva
    // accumulating. Es la causa clásica de " firebase: Auth ... called
    // outside of a component" y de fugas de memoria.
    return observarSesion(async (usuario: User | null) => {
      if (!usuario) {
        setEstado('anonimo')
        return
      }
      // El documento del organizador se pide una sola vez, acá. Las
      // pantallas hijas lo reciben por props o lo piden de nuevo: leer
      // un doc de Firestore es barato, pero pedirlo en cada render es
      // lo que hace que una app se sienta lenta.
      const documento = await asegurarDocumentoOrganizador(usuario)
      setOrganizador(documento)
      setEstado('autenticado')
    })
  }, [])

  if (estado === 'cargando') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <p className="text-sm text-slate-500">Cargando tu cuenta…</p>
      </main>
    )
  }

  if (estado === 'anonimo') {
    // `replace` para que el login no quede en el historial: si el
    // usuario apretó "atrás" después de loguearse, no vuelve a
    // /entrar para siempre.
    return <Navigate to="/entrar" replace state={{ desde: ubicacion.pathname }} />
  }

  return <>{children(organizador as Organizador)}</>
}
