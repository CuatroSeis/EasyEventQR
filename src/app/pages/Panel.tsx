import { Link } from 'react-router-dom'

import { salir } from '../../services/auth'
import type { Organizador } from '../../shared/types'

/**
 * Panel del organizador — esqueleto de la Fase 1.
 *
 * La Fase 2 lo llena de eventos y reservas. Acá sólo se demuestra que
 * la sesión y el documento del organizador se leen bien, y se muestra
 * el plan y los límites que NO puede tocar.
 *
 * No vuelve a suscribirse a onAuthStateChanged: el email ya viene en
 * el documento del organizador, y una suscripción por pantalla es
 * exactamente cómo una app se pone lenta sin que se note por qué.
 */
export default function Panel({ organizador }: { organizador: Organizador }) {
  const limites = organizador.limitesPersonalizacion
  const habilitada = (permitido: boolean) => (permitido ? 'sí' : 'no')

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-4 pb-16">
      <header className="flex items-center justify-between gap-3 pt-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{organizador.nombre}</h1>
          <p className="text-sm text-slate-600">{organizador.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void salir()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
        >
          Salir
        </button>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Tu cuenta</h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-600">Uid</dt>
          <dd className="font-mono text-xs text-slate-900">{organizador.uid}</dd>
          <dt className="text-slate-600">Plan</dt>
          <dd className="font-semibold text-slate-900">{organizador.plan}</dd>
          <dt className="text-slate-600">Estado</dt>
          <dd className="text-slate-900">{organizador.estadoSuscripcion}</dd>
          <dt className="text-slate-600">Alta</dt>
          <dd className="text-slate-900">
            {organizador.fechaAlta instanceof Date
              ? organizador.fechaAlta.toLocaleDateString('es-AR')
              : '—'}
          </dd>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Personalización disponible</h2>
        <p className="mt-1 text-xs text-slate-600">
          Estos límites los asigna el administrador de la plataforma, no vos. Si los pudieras
          editar, la restricción de los planes no valdría nada.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-800">
          <li>Color personalizado: {habilitada(limites.colorPersonalizadoPermitido)}</li>
          <li>Banner: {habilitada(limites.bannerPermitido)}</li>
          <li>Logo: {habilitada(limites.logoPermitido)}</li>
        </ul>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Próximamente</h2>
        <p className="mt-1 text-xs text-slate-600">
          Tus eventos, las reservas y el escaneo de entradas llegan en la Fase 2 y la Fase 7.
        </p>
      </section>

      <Link to="/" className="text-xs text-slate-500 underline">
        Volver al inicio
      </Link>
    </main>
  )
}
