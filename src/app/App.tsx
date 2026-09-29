import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import Home from './pages/Home'

/**
 * BrowserRouter usa la History API: /panel se resuelve en el cliente.
 * Por eso el deploy necesita el rewrite de vercel.json que manda todo a
 * index.html — sin eso, recargar una URL profunda da 404.
 *
 * POR QUÉ LAS RUTAS CON FIREBASE VAN CON lazy()
 *
 * Home es la landing pública: no necesita ni auth ni firestore. Si
 * Login y Panel se importan de forma estática, el import estático los
 * mete en el grafo del bundle inicial y con ellos entra TODO el SDK de
 * Firebase. Medido: el bundle inicial sube de 263 kB a 798 kB, que es
 * exactamente el problema que el patrón de src/services/config.ts
 * había resuelto en la Fase 0 y que vuelve por la puerta de atrás si
 * las rutas se importan sin pensar.
 *
 * Con lazy() el SDK queda en los chunks de /entrar y /panel, y quien
 * abre la home no lo descarga. Además es el comportamiento correcto para
 * un producto mobile-first: menos kilobytes en la primera pantalla
 * sobre datos móviles.
 */
/**
 * Las dos rutas públicas de la Fase 3 van con lazy() por el mismo motivo
 * que las del panel y con un motivo más: ni una ni otra toca Firebase.
 * Si se importaran de forma estática, el import estático los mete en el
 * grafo del bundle inicial y arrastran el SDK entero a la landing
 * pública, que es la página que abre la mayoría de las visitas.
 */
const EventoPublico = lazy(() => import('./pages/EventoPublico'))
const QrPublico = lazy(() => import('./pages/QrPublico'))
const Login = lazy(() => import('./pages/Login'))
const Panel = lazy(() => import('./pages/Panel'))
const EventoForm = lazy(() => import('./pages/EventoForm'))
const Branding = lazy(() => import('./pages/Branding'))
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
          <Route path="/entrar" element={<Login />} />
          <Route element={<Protegido />}>
            <Route element={<PanelLayout />}>
              <Route path="/panel" element={<Panel />} />
              <Route path="/panel/eventos/nuevo" element={<EventoForm />} />
              <Route path="/panel/eventos/:eventoId" element={<EventoForm />} />
              <Route path="/panel/branding" element={<Branding />} />
            </Route>
          </Route>
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
