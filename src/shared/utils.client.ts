/**
 * Utilidades solo para el cliente (navegador).
 * Usan APIs del DOM: File, Image, canvas, URL.
 */

/**
 * Comprime una imagen a base64 WebP ≤ maxKB y ≤ maxDim px.
 * Lanza si no se puede comprimir lo suficiente.
 * Solo funciona en el navegador (usa Image, canvas, URL).
 */
export async function comprimirImagenABase64(
  file: File,
  maxKB = 512,
  maxDim = 512
): Promise<string> {
  const img = new Image()
  const url = URL.createObjectURL(file)
  try {
    img.src = url
    await img.decode()
  } finally {
    URL.revokeObjectURL(url)
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  let { width, height } = img

  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height)
    width *= ratio
    height *= ratio
  }
  canvas.width = width
  canvas.height = height
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.8
  let dataUrl = canvas.toDataURL('image/webp', quality)
  const maxBytes = maxKB * 1024

  // Baja calidad hasta caber
  while (dataUrl.length > maxBytes && quality > 0.1) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/webp', quality)
  }

  if (dataUrl.length > maxBytes) {
    throw new Error(`Imagen muy grande (${Math.round(dataUrl.length / 1024)}KB). Reducí tamaño o calidad.`)
  }

  return dataUrl
}