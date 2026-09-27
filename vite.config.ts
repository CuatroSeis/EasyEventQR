import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * BUILD 1 — la aplicación (panel del organizador + landing pública).
 *
 * Sale en dist/ y es lo que se deploya en Vercel.
 * El widget tiene su propia config: vite.widget.config.ts
 */
export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4 va como plugin de Vite: lee los archivos fuente,
    // detecta qué clases se usan y genera sólo el CSS necesario.
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Mismo alias que en tsconfig.app.json. Si lo cambiás en uno,
      // cambialo en los dos, o TypeScript y Vite van a discrepar.
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    // Al compilar la app, Vite copia todo lo que hay en public/ a dist/.
    // Como el build 2 escribe public/widget/widget.js, el orden de los
    // scripts en package.json (widget primero) hace que el widget termine
    // en dist/widget/widget.js dentro del mismo deploy.
  },
})
