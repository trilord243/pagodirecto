import { apiUpload } from './api.ts'
import { toEditableMenu, type ApiMenu, type EditableMenu } from './menu.ts'

export const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp'
export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_FILES = 5

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `"${file.name}" no es PDF, JPG, PNG ni WebP.`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" pesa más de 10 MB.`
  }
  return null
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Subir y escanear son una sola petición, de 20 a 60 s, que no guarda nada.
// `onProgress` llega a 100 al terminar la subida: desde ahí se espera el escaneo.
export async function analyzeMenu(
  token: string,
  files: File[],
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<EditableMenu> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return toEditableMenu(
    await apiUpload<ApiMenu>('/restaurants/menu/analyze', form, {
      token,
      signal,
      onProgress,
    }),
  )
}
