// Cliente mínimo del backend. El token viaja explícito en cada llamada: solo el
// login va sin él, y por eso su 401 no cuenta como sesión vencida.
// Vacía significa mismo origen: en producción el portal y la API van juntos.
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

const NETWORK_ERROR =
  'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
const SERVER_ERROR = 'Algo falló en el servidor. Intenta de nuevo en unos minutos.'

// nginx responde estos códigos en HTML, sin el `message` del backend.
const STATUS_ERRORS: Record<number, string> = {
  413: 'Los archivos pesan demasiado. Sube menos páginas o archivos más livianos.',
  429: 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.',
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : SERVER_ERROR

let onSessionExpired: (() => void) | null = null

// La app se suscribe mientras hay sesión para volver al login con cualquier 401.
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function serverMessage(body: unknown): string {
  const message = (body as { message?: unknown } | null | undefined)?.message
  if (Array.isArray(message)) return message.join(' ')
  return typeof message === 'string' ? message : ''
}

function readResponse<T>(status: number, text: string, token?: string): T {
  const body = text ? parseJson(text) : undefined
  if (status >= 200 && status < 300) {
    if (text && body === undefined) throw new ApiError(status, SERVER_ERROR)
    return body as T
  }

  if (status === 401 && token) onSessionExpired?.()
  // Un 500 de Nest siempre dice "Internal server error", en inglés.
  const message = status === 500 ? '' : serverMessage(body)
  throw new ApiError(status, message || STATUS_ERRORS[status] || SERVER_ERROR)
}

interface RequestOptions {
  method?: 'POST' | 'PUT' | 'PATCH'
  token?: string
  body?: unknown
  signal?: AbortSignal
}

export async function apiRequest<T>(
  path: string,
  { method, token, body, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let status: number
  let text: string
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    status = response.status
    text = await response.text()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(0, NETWORK_ERROR)
  }
  return readResponse<T>(status, text, token)
}

interface UploadOptions {
  token: string
  signal: AbortSignal
  onProgress: (percent: number) => void
}

// Va con XMLHttpRequest porque fetch no informa el avance de la subida.
export function apiUpload<T>(
  path: string,
  form: FormData,
  { token, signal, onProgress }: UploadOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE_URL}${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.upload.onload = () => onProgress(100)
    xhr.onload = () => {
      try {
        resolve(readResponse<T>(xhr.status, xhr.responseText, token))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR))
    xhr.onabort = () => reject(new DOMException('Cancelado', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}
