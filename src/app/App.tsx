import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import Home from './pages/Home'

/**
 * Todo con Firebase va con lazy(): un import estático metería el SDK
 * entero en el bundle inicial (medido: 263 kB → 798 kB). El rewrite a
 * index.html vive en vercel.json (History API).
 */
const EventoPublico = lazy(() => import('./pages/EventoPublico'))
const QrPublico = lazy(() => import('./pages/QrPublico'))
const Login = lazy(() => import('./pages/Login'))
const Panel = lazy(() => import('./pages/Panel'))
const Cuenta = lazy(() => import('./pages/Cuenta'))
const EventoForm = lazy(() => import('./pages/EventoForm'))
const Branding = lazy(() => import('./pages/Branding'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const PanelRegistros = lazy(() => import('./pages/PanelRegistros'))
const Operador = lazy(() => import('./pages/Operador'))
const EscanearQR = lazy(() => import('./pages/EscanearQR'))
const PagoSimulado = lazy(() => import('./pages/PagoSimulado'))
const PagoExito = lazy(() => import('./pages/PagoExito'))
const PagoFallo = lazy(() => import('./pages/PagoFallo'))
const PagoPendiente = lazy(() => import('./pages/PagoPendiente'))
const NoEncontrado = lazy(() => import('./pages/NoEncontrado'))
const Protegido = lazy(() => import('./components/Protegido'))
const PanelLayout = lazy(() => import('./components/PanelLayout'))

/**
 * Las rutas de /panel van anidadas, y no como una lista plana.
 *
 * La anidacion hace dos cosas a la vez. `Protegido` envuelve a todas:
 * lee el documento del organizador una vez, comprueba la sesion y
 * provee el contexto. `PanelLayout` envuelve a todas: la barra de
 * arriba, la barra fija de abajo y la aplicacion del tema.
 *
 * Si esto fuera plano, cada pantalla nueva seria un <Route> suelto, y
 * para que tenga la barra y el tema habria que acordarse de envolverla a
 * mano. Acordarse es justo lo que falla la tercera pantalla.
 *
 * /panel va envuelto en Protegido, que NO es una medida de seguridad:
 * es UX. Si alguien entra a /panel sin sesion, redirige a /entrar. Lo
 * que protege los datos de verdad son las reglas de Firestore, que
 * funcionan aunque el usuario entre por la URL que quiera.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* /e/:eventoId es la landing que se comparte por WhatsApp y
              /q/:token es lo que escanea el asistente. Ninguna de las dos
              necesita sesión: es el producto público, y por eso van
              FUERA del <Protegido>, que además es sólo UX, no
              seguridad. */}
          <Route path="/e/:eventoId" element={<EventoPublico />} />
          <Route path="/q/:token" element={<QrPublico />} />
          <Route path="/pago/simulado" element={<PagoSimulado />} />
          <Route path="/pago/exito" element={<PagoExito />} />
          <Route path="/pago/fallo" element={<PagoFallo />} />
          <Route path="/pago/pendiente" element={<PagoPendiente />} />
          <Route path="/operador/:token" element={<Operador />} />
          <Route path="/entrar" element={<Login />} />
          <Route element={<Protegido />}>
            <Route element={<PanelLayout />}>
              <Route path="/panel" element={<Panel />} />
              <Route path="/panel/cuenta" element={<Cuenta />} />
              <Route path="/panel/eventos/nuevo" element={<EventoForm />} />
              <Route path="/panel/eventos/:eventoId" element={<EventoForm />} />
              <Route path="/panel/eventos/:eventoId/registros" element={<PanelRegistros />} />
              <Route path="/panel/eventos/:eventoId/escanear" element={<EscanearQR />} />
              <Route path="/panel/branding" element={<Branding />} />
            </Route>
          </Route>
          {/*
            `/admin` va FUERA de `<Protegido>` a propósito. `<Protegido>`
            exige que el organizador esté activo, y el super-admin es la
            única persona que puede reactivar cuentas suspendidas: si su
            propia cuenta se suspendiera, anidarlo acá lo encerraría en
            una pantalla que dice "pedí que te reactiven" sin darle el
            panel donde pedirlo. El panel se autoriza solo contra
            `/api/me`, así que no pierde nada de seguridad.
          */}
          <Route path="/admin" element={<AdminPanel />} />
          {/* Sin esta ruta, una URL mal escrita muestra una pantalla en
              blanco, que en el móvil se lee como "la app no funciona". */}
          <Route path="*" element={<NoEncontrado />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function Cargando() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <p className="text-sm text-slate-500">Cargando…</p>
    </main>
  )
}
