import { Link } from 'react-router-dom'
import { useIdioma } from '../components/IdiomaContext'

/** 404 en español y con salida: una pantalla muerta en el móvil se lee
 *  como caída de la app. */
export default function NoEncontrado() {
  const { t } = useIdioma()
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-4xl font-bold text-slate-300">404</p>
      <h1 className="text-lg font-semibold text-slate-900">{t('e404.t')}</h1>
      <p className="text-sm text-slate-600">{t('e404.d')}</p>
      <Link
        to="/"
        className="rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario"
      >
        {t('pago.fallo.inicio')}
      </Link>
    </main>
  )
}
