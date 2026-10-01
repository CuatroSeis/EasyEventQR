import { useState, useEffect, useCallback } from 'react'

interface EventoPublico {
  eventoId: string
  nombre: string
  fecha: string
  lugar: string
  descripcion: string
  lugaresRestantes: number
  agotado: boolean
  requierePago: boolean
  precioEntrada: number | null
  personalizacion: {
    bannerUrl: string | null
    logoUrl: string | null
    colorPrimario: string | null
    colorSecundario: string | null
    textoBienvenida: string | null
    textoConfirmacion: string | null
  }
}

type Theme = 'light' | 'dark' | 'auto'

interface WidgetAppProps {
  eventoId: string
  theme: Theme
}

export function WidgetApp({ eventoId, theme }: WidgetAppProps) {
  const [evento, setEvento] = useState<EventoPublico | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.style.colorScheme = 'dark'
    } else {
      root.style.colorScheme = 'light'
    }
  }, [theme])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    fetch(`/api/evento-publico?id=${encodeURIComponent(eventoId)}`)
      .then(async (resp) => {
        const data = await resp.json()
        if (!mounted) return
        if (!resp.ok || !data.ok || !data.evento) {
          throw new Error(data.error || 'No se pudo cargar el evento')
        }
        setEvento(data.evento)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Error cargando el evento')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => { mounted = false }
  }, [eventoId])

  const getMaxBirthDate = useCallback(() => {
    const hoy = new Date()
    const hace18 = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate())
    const yyyy = hace18.getFullYear()
    const mm = String(hace18.getMonth() + 1).padStart(2, '0')
    const dd = String(hace18.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }, [])

  const formatDate = useCallback((iso: string) => {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [])

  const escapeHtml = useCallback((str: string) => {
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '')
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return

    const form = e.currentTarget
    const formData = new FormData(form)
    const honeypot = formData.get('sitioWeb')

    if (honeypot) {
      // Bot detectado - responder igual que éxito pero sin hacer nada
      setSuccess(true)
      return
    }

    setSubmitting(true)
    setFieldErrors({})

    const payload = {
      eventoId,
      nombre: formData.get('nombre') as string,
      email: formData.get('email') as string,
      dni: formData.get('dni') as string,
      fechaNacimiento: formData.get('fechaNacimiento') as string,
      telefono: formData.get('telefono') as string,
      sitioWeb: formData.get('sitioWeb') as string,
    }

    try {
      const resp = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await resp.json()

      if (resp.ok && data.ok) {
        setSuccess(true)
      } else {
        if (data.problemas) {
          const newErrors: Record<string, string> = {}
          for (const p of data.problemas) {
            newErrors[p.campo] = p.mensaje
          }
          setFieldErrors(newErrors)
        } else {
          setError(data.error || 'No se pudo completar la reserva')
        }
      }
    } catch {
      setError('No pudimos conectarnos. Revisá la conexión e intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
        Cargando evento…
      </div>
    )
  }

  if (error && !evento) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#dc2626', background: '#fef2f2', borderRadius: 12 }}>
        No se pudo cargar el evento.<br />
        <code>{escapeHtml(error)}</code>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--c-primario, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 28, color: 'white'
        }}>✓</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>¡Tu lugar está reservado!</h2>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, marginBottom: 16 }}>
          Te enviamos el código de entrada a tu correo. Ábrelo, y si no te llega,
          revisá la carpeta de spam antes de volver a reservar: registrarte dos veces gasta dos lugares.
        </p>
        <div style={{ padding: 12, background: '#f8fafc', borderRadius: 10, fontSize: 13, color: '#475569' }}>
          <strong>Mostralo en la puerta con el brillo alto.</strong><br />
          El código es único y personal. No lo compartas.
        </div>
      </div>
    )
  }

  if (!evento) return null

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {evento.personalizacion?.bannerUrl && (
        <img
          src={evento.personalizacion.bannerUrl}
          alt=""
          style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: '12px 12px 0 0', margin: '-16px -16px 16px' }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      {evento.personalizacion?.logoUrl && (
        <img
          src={evento.personalizacion.logoUrl}
          alt=""
          style={{ height: 48, marginBottom: 12 }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        {escapeHtml(evento.nombre)}
      </h1>

      <div style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <span>📅 {escapeHtml(formatDate(evento.fecha))}</span>
        {evento.lugar && <span>📍 {escapeHtml(evento.lugar)}</span>}
      </div>

      {evento.descripcion && (
        <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 16 }}>
          {escapeHtml(evento.descripcion)}
        </p>
      )}

      {evento.personalizacion?.textoBienvenida && (
        <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, fontSize: 14, color: '#334155', marginBottom: 16 }}>
          {escapeHtml(evento.personalizacion.textoBienvenida)}
        </div>
      )}

      {evento.requierePago && evento.precioEntrada && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fef3c7', borderRadius: 9999, fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 16 }}>
          La entrada cuesta ${evento.precioEntrada.toLocaleString('es-AR')}. Te enviaremos el link de pago por correo.
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} aria-hidden="true">
          <label htmlFor="sitioWeb">No completar</label>
          <input id="sitioWeb" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} htmlFor="nombre">Tu nombre</label>
          <input
            id="nombre" name="nombre" type="text" required minLength={2} maxLength={80} autoComplete="name"
            placeholder="Juan Pérez"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16,
              border: fieldErrors.nombre ? '1px solid #dc2626' : '1px solid #e2e8f0',
              borderRadius: 10, background: '#fff', color: '#0f172a', outline: 'none', minHeight: 44
            }}
            onFocus={() => setFieldErrors(prev => { const n = { ...prev }; delete n.nombre; return n })}
          />
          {fieldErrors.nombre && <span style={{ fontSize: 12, color: '#dc2626' }}>{fieldErrors.nombre}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} htmlFor="email">Tu correo</label>
          <input
            id="email" name="email" type="email" required maxLength={254} autoComplete="email"
            placeholder="juan@ejemplo.com"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16,
              border: fieldErrors.email ? '1px solid #dc2626' : '1px solid #e2e8f0',
              borderRadius: 10, background: '#fff', color: '#0f172a', outline: 'none', minHeight: 44
            }}
            onFocus={() => setFieldErrors(prev => { const n = { ...prev }; delete n.email; return n })}
          />
          {fieldErrors.email && <span style={{ fontSize: 12, color: '#dc2626' }}>{fieldErrors.email}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} htmlFor="dni">Tu DNI (sin puntos ni guiones)</label>
          <input
            id="dni" name="dni" type="text" required pattern="[0-9]{7,8}" maxLength={8} inputMode="numeric"
            placeholder="12345678"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16,
              border: fieldErrors.dni ? '1px solid #dc2626' : '1px solid #e2e8f0',
              borderRadius: 10, background: '#fff', color: '#0f172a', outline: 'none', minHeight: 44
            }}
            onFocus={() => setFieldErrors(prev => { const n = { ...prev }; delete n.dni; return n })}
          />
          {fieldErrors.dni && <span style={{ fontSize: 12, color: '#dc2626' }}>{fieldErrors.dni}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} htmlFor="fechaNacimiento">Fecha de nacimiento</label>
          <input
            id="fechaNacimiento" name="fechaNacimiento" type="date" required max={getMaxBirthDate()}
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16,
              border: fieldErrors.fechaNacimiento ? '1px solid #dc2626' : '1px solid #e2e8f0',
              borderRadius: 10, background: '#fff', color: '#0f172a', outline: 'none', minHeight: 44
            }}
            onFocus={() => setFieldErrors(prev => { const n = { ...prev }; delete n.fechaNacimiento; return n })}
          />
          {fieldErrors.fechaNacimiento && <span style={{ fontSize: 12, color: '#dc2626' }}>{fieldErrors.fechaNacimiento}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} htmlFor="telefono">Tu teléfono (opcional)</label>
          <input
            id="telefono" name="telefono" type="tel" maxLength={32} autoComplete="tel"
            placeholder="+54 9 11 0000 0000"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16,
              border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#0f172a', outline: 'none', minHeight: 44
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', padding: 14, fontSize: 15, fontWeight: 600, color: 'white',
            background: 'var(--c-primario, #7c3aed)', border: 'none', borderRadius: 10,
            cursor: submitting ? 'not-allowed' : 'pointer', minHeight: 44, opacity: submitting ? 0.6 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {submitting ? 'Reservando…' : 'Reservar mi lugar'}
        </button>

        <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', margin: 0 }}>
          Te enviaremos el código por correo. Guárdalo: es tu entrada.
        </p>
      </form>
    </div>
  )
}