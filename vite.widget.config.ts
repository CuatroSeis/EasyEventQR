import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * BUILD 2 — el Web Component embebible (<ticket-widget>).
 *
 * Sale en public/widget/widget.js y termina en dist/widget/widget.js
 * dentro del mismo deploy de Vercel.
 *
 * ¿POR QUÉ UN BUILD SEPARADO Y NO UN SEGUNDO ENTRY EN EL MISMO?
 * Porque el widget se carga dentro del sitio de un tercero. Si compartiera
 * bundle con el panel, el sitio del organizador descargaría React, React
 * Router y el SDK de Firebase para mostrar un formulario de 3 campos.
 *
 * ¿POR QUÉ IIFE Y NO ESM?
 * Un <script type="module"> cross-origin necesita CORS en el bundle.
 * IIFE es un script clásico en un solo archivo: se pega con
 *
 *   <script src="https://easyeventqr.vercel.app/widget/widget.js"></script>
 *
 * en cualquier sitio, sin headers especiales y sin configuración del host.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // El widget no tiene assets estáticos que copiar. Decirlo explícitamente
  // además silencia el warning de "outDir y publicDir no son carpetas
  // separadas": si no, Vite cree que el build podría pisar public/.
  publicDir: false,
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    outDir: 'public/widget',
    // No borramos la carpeta: el nombre del archivo es fijo (widget.js),
    // no hay hashes que se acumulen, y vaciar public/ desde acá sería
    // más frágil de lo que aporta.
    emptyOutDir: false,
    lib: {
      entry: 'src/widget/index.tsx',
      name: 'EasyEventQRWidget',
      // IIFE = Immediately Invoked Function Expression: un archivo,
      // un scope global, cero imports externos.
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    // Una sola hoja de estilos para todo el widget. En la Fase 4 se
    // inyecta dentro del ShadowRoot.
    cssCodeSplit: false,
  },
})
