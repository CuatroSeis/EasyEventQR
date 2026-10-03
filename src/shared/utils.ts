/**
 * Utilidades compartidas entre cliente y servidor.
 * No importan React, Firebase ni SDKs de servidor.
 * No usan APIs del navegador (DOM, File, Image, etc.).
 */

/** Normaliza texto para búsqueda: minúsculas, sin tildes, solo alfanumérico y guiones. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Genera un código corto aleatorio tipo FEST-8K2P (6-8 chars alfanuméricos). */
export function generarCodigoCorto(prefijo = ''): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin I, O, 0, 1
  let resultado = ''
  for (let i = 0; i < 6; i++) {
    resultado += chars[Math.floor(Math.random() * chars.length)]
  }
  return prefijo ? `${prefijo}-${resultado}` : resultado
}

/** Valida formato de código corto (ej. FEST-8K2P). */
export function esCodigoValido(codigo: string): boolean {
  return /^[A-Z0-9]{6,8}(-[A-Z0-9]{4,6})?$/.test(codigo)
}

/** Genera slug kebab-case a partir de un nombre. */
export function generarSlug(nombre: string): string {
  const base = normalizarTexto(nombre)
  const sufijo = Math.random().toString(36).slice(2, 6)
  return `${base}-${sufijo}`
}

/** Valida slug kebab-case con sufijo alfanumérico. */
export function esSlugValido(slug: string): boolean {
  return /^[a-z0-9-]+-[a-z0-9]{4}$/.test(slug)
}