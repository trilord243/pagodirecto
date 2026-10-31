export interface Session {
  username: string
  // Identificador del comercio con el que el agente de WhatsApp lo busca.
  restaurantId: string
}

export interface Credentials {
  username: string
  password: string
}

export interface CredentialErrors {
  username?: string
  password?: string
}

const SESSION_KEY = 'pd-comercios-session'
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/
const MIN_PASSWORD_LENGTH = 6

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase()

export function validateCredentials({
  username,
  password,
}: Credentials): CredentialErrors {
  const errors: CredentialErrors = {}
  if (!USERNAME_PATTERN.test(normalizeUsername(username))) {
    errors.username =
      'Usa de 3 a 30 letras, números, puntos, guiones o guiones bajos.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  }
  return errors
}

// El mismo usuario siempre obtiene el mismo ID, así el agente de WhatsApp
// puede encontrar el comercio en cualquier momento. Formato: PD-XXXXXXXX.
export async function restaurantIdFor(username: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeUsername(username))
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `PD-${hex.slice(0, 8).toUpperCase()}`
}

// TODO: reemplazar por la autenticación real del backend. Por ahora acepta
// cualquier usuario y contraseña con formato válido y no verifica la clave.
export async function login(credentials: Credentials): Promise<Session> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  const username = normalizeUsername(credentials.username)
  return { username, restaurantId: await restaurantIdFor(username) }
}

// La sesión dura mientras la pestaña esté abierta. Nunca se guarda la clave.
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    return parsed.username && parsed.restaurantId
      ? { username: parsed.username, restaurantId: parsed.restaurantId }
      : null
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Sin almacenamiento la sesión solo dura hasta recargar la página.
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Nada que limpiar.
  }
}
