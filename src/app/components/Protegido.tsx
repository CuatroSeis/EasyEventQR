import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'

import { asegurarDocumentoOrganizador, observarSesion } from '../../services/auth'
import { ProveedorOrganizador } from '../ContextoOrganizador'
import type { Organizador } from '../../shared/types'

/**
 * Guarda de rutas del panel.
 *
 * Va como layout route: envuelve a todas las pantallas de /panel y
 * renderiza un <Outlet/>. Antes recibía children como render prop, que
 * obligaba a que cada ruta nueva envolviera a mano el children en
 * <Protegido>{(org) => ...}</Protegido>. Con el Outlet, agregar
 * /panel/branding es agregar una ruta y nada más.
 *
 * El documento del organizador se lee UNA vez acá y se reparte por
 * contexto, en vez de que cada pantalla lo pida por su cuenta.
 *
 * Lo que NO hace, y es lo importante: no decide permisos. Que el usuario
 * esté logueado se comprueba acá porque es cómodo, pero el aislamiento
 * real entre organizadores está en firestore.rules. Si alguien borra
 * este componente o mete un <Link> al panel, lo que pasa es que ve una
 * pantalla con "cargando" y los datos no llegan: las reglas los cortan.
 * Un guarda de ruta es UX; las reglas son seguridad. Confundir las dos
 * cosas es el error clásico de este tipo de proyecto.
 */
export default function Protegido() {
  const [estado, setEstado] = useState<'cargando' | 'autenticado' | 'anonimo'>('cargando')
  const [organizador, setOrganizador] = useState<Organizador | null>(null)
  const ubicacion = useLocation()

  useEffect(() => {
    // observarSesion devuelve la función de baja: sin este return, en
    // cada montaje de StrictMode quedaría una suscripción viva
    // acumulándose. Es la causa clásica de los avisos de "Auth ... called
    // outside of a component" y de las fugas de memoria.
    return observarSesion(async (usuario: User | null) => {
      if (!usuario) {
        setEstado('anonimo')
        return
      }
      const documento = await asegurarDocumentoOrganizador(usuario)
      setOrganizador(documento)
      setEstado('autenticado')
    })
  }, [])

  // El objeto del contexto se memoiza porque PanelLayout tiene un
  // useEffect con dependencia [organizador.brandingPanel]. Sin useMemo,
  // un render de cualquiera que pase por acá crearía un objeto nuevo y
  // el efecto se volvería a disparar aunque el branding no haya
  // cambiado, que es lo mismo que no tener el efecto.
  const valor = useMemo(
    () => (organizador ? { organizador, actualizar: setOrganizador } : null),
    [organizador],
  )

  if (estado === 'cargando') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <p className="text-sm text-texto-suave">Cargando tu cuenta…</p>
      </main>
    )
  }

  if (estado === 'anonimo') {
    // `replace` para que el login no quede en el historial: si el
    // usuario apretó "atrás" después de loguearse, no vuelve a
    // /entrar para siempre.
    return <Navigate to="/entrar" replace state={{ desde: ubicacion.pathname }} />
  }

  if (!valor) return null

  return (
    <ProveedorOrganizador valor={valor}>
      <Outlet />
    </ProveedorOrganizador>
  )
}
