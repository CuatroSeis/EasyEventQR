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
 * abre la home no lo descarga. Además es la behavior correcta para
 * un producto mobile-first: menos kilobytes en la primera pantalla
 * sobre datos móviles.
 */
const Login = lazy(() => import('./pages/Login'))
const Panel = lazy(() => import('./pages/Panel'))
const NoEncontrado = lazy(() => import('./pages/NoEncontrado'))
const Protegido = lazy(() => import('./components/Protegido'))

/**
 * /panel va envuelto en Protegido, que NO es una medida de seguridad:
 * es UX. Si alguien entra a /panel sin sesión, redirige a /entrar. Lo
 * que protege los datos de verdad son las reglas de Firestore, que
 * funcionan aunque el usuario entre por la URL que quiera.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/entrar" element={<Login />} />
          <Route
            path="/panel"
            element={
              // Render prop: el guarda ya leyó el documento del
              // organizador y se lo pasa al panel, así el panel no
              // vuelve a pedirlo.
              <Protegido>{(organizador) => <Panel organizador={organizador} />}</Protegido>
            }
          />
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
