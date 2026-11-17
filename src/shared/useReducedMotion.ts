import { useEffect, useState } from 'react'

/**
 * Hook que devuelve true si el usuario prefirió reducir movimiento
 * (prefers-reduced-motion: reduce). Útil para desactivar animaciones
 * decorativas como spinners o pings en usuarios con sensibilidad vestibular.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mql.matches)
    setReduced(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return reduced
}
