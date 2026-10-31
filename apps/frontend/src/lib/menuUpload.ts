export const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp'
export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_FILES = 5

export interface MenuSubmission {
  id: string
  restaurantId: string
  files: File[]
}

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

// TODO: conectar con el endpoint del backend cuando exista. Por ahora simula
// la subida para poder recorrer el flujo completo del portal.
export async function submitMenu(
  restaurantId: string,
  files: File[],
  onProgress: (percent: number) => void,
): Promise<MenuSubmission> {
  for (let percent = 0; percent <= 100; percent += 10) {
    onProgress(percent)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return {
    id: crypto.randomUUID(),
    restaurantId,
    files,
  }
}
