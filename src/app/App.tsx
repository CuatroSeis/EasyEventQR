import { BrowserRouter, Route, Routes } from 'react-router-dom'

import Home from './pages/Home'

/**
 * BrowserRouter usa la History API: /evento/123 se resuelve en el
 * cliente. Por eso el deploy necesita el rewrite de vercel.json que
 * manda todo a index.html — sin eso, recargar una URL profunda da 404.
 *
 * En la Fase 3 se agrega la landing pública (/evento/:eventoId) y el
 * panel del organizador (/panel/*), más una ruta * que muestra 404.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
