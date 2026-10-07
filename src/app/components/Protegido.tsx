import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { User } from 'firebase/auth'

import { asegurarDocumentoOrganizador, observarSesion } from '../../services/auth'
import { ProveedorOrganizador } from '../ContextoOrganizador'
import { useIdioma } from './IdiomaContext'
import type { Organizador } from '../../shared/types'

/** Guarda de rutas: UX, no seguridad (el aislamiento real está en firestore.rules). Lee el organizador UNA vez y lo reparte por contexto. */
export default function Protegido() {
  const { t } = useIdioma()
  const [estado, setEstado] = useState<'cargando' | 'autenticado' | 'anonimo'>('cargando')
  const [organizador, setOrganizador] = useState<Organizador | null>(null)
  const ubicacion = useLocation()

  useEffect(() => {
    // Sin este return, StrictMode acumula suscripciones vivas.
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

  // Memoizado: si no, el efecto de tema de PanelLayout se redispara en cada render.
  const valor = useMemo(
    () => (organizador ? { organizador, actualizar: setOrganizador } : null),
    [organizador],
  )

  if (estado === 'cargando') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <p className="text-sm text-texto-suave">{t('prot.cargando')}</p>
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

  // --------------------------------------------------------------------
  //  Cuenta suspendida
  // --------------------------------------------------------------------
  //
  // `organizacionActiva()` en firestore.rules exige
  // `estadoSuscripcion == 'activo'`. Con la cuenta suspendida, TODO lo que
  // escribe el panel rebota con `permission-denied`: no se pueden crear
  // eventos, ni editar, ni cambiar el branding.
  //
  // Antes de este corte, el usuario entraba al panel con normalidad, veía
  // los formularios, y se enteraba del problema recién al guardar, con el
  // texto crudo de Firebase. La app ya SABÍA el motivo: lo tenía en la
  // variable de al lado. Mostrar el muro con la explicación es más honesto
  // que dejar que lo descubra tarde y sin contexto.
  //
  // Se corta acá y no en cada pantalla porque la causa es una sola y el
  // remedio es uno: reactivar la cuenta.
  if (organizador && organizador.estadoSuscripcion === 'suspendido') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-borde bg-superficie p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl" aria-hidden="true">
            ⏸
          </div>
          <h1 className="mt-4 text-lg font-bold text-texto">{t('prot.susp.t')}</h1>
          <p className="mt-2 text-sm text-texto-suave">{t('prot.susp.d')}</p>
          <p className="mt-4 rounded-lg bg-superficie p-3 text-xs text-texto-suave">{t('prot.susp.d2')}</p>
          <div className="mt-5 flex flex-col gap-2">
            <a
              href="/"
              className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-texto"
            >
              {t('prot.inicio')}
            </a>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg px-4 py-2 text-sm text-texto-suave underline"
            >
              {t('prot.recargar')}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <ProveedorOrganizador valor={valor}>
      <Outlet />
    </ProveedorOrganizador>
  )
}
