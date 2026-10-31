import { apiRequest } from './api.ts'

export interface Session {
  token: string
  // El nombre del negocio, que es lo que ven el comercio y sus clientes.
  name: string
  username: string
  // Identificador del comercio con el que el agente de WhatsApp lo busca.
  restaurantId: string
}

export interface Credentials {
  username: string
  password: string
}

export interface Registration extends Credentials {
  name: string
}

export interface CredentialErrors {
  name?: string
  username?: string
  password?: string
}

interface AuthResponse {
  token: string
  restaurant: { name: string; restaurantId: string; username: string }
}

const SESSION_KEY = 'pd-comercios-session'
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/
const MIN_PASSWORD_LENGTH = 6
const MIN_NAME_LENGTH = 2
export const MAX_NAME_LENGTH = 60

const normalizeUsername = (raw: string) => raw.trim().toLowerCase()

// Al ingresar solo se evita un viaje en vano: quien decide es el backend, y las
// cuentas existentes pueden no cumplir las reglas de registro.
export function validateLogin({
  username,
  password,
}: Credentials): CredentialErrors {
  const errors: CredentialErrors = {}
  if (!username.trim()) errors.username = 'Ingresa tu usuario.'
  if (!password) errors.password = 'Ingresa tu contraseña.'
  return errors
}

export function validateRegistration({
  name,
  username,
  password,
}: Registration): CredentialErrors {
  const errors: CredentialErrors = {}
  if (name.trim().length < MIN_NAME_LENGTH) {
    errors.name = 'Escribe el nombre de tu negocio.'
  }
  if (!USERNAME_PATTERN.test(normalizeUsername(username))) {
    errors.username =
      'Usa de 3 a 30 letras, números, puntos, guiones o guiones bajos.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  }
  return errors
}

async function authenticate(
  path: string,
  { username, password, ...profile }: Credentials & Partial<Registration>,
): Promise<Session> {
  const { token, restaurant } = await apiRequest<AuthResponse>(path, {
    method: 'POST',
    body: { ...profile, username: normalizeUsername(username), password },
  })
  return {
    token,
    name: restaurant.name,
    username: restaurant.username,
    restaurantId: restaurant.restaurantId,
  }
}

export const login = (credentials: Credentials) =>
  authenticate('/restaurants/auth/login', credentials)

// Crea el comercio y su ID, y deja la sesión abierta igual que el login.
export const register = (registration: Registration) =>
  authenticate('/restaurants/auth/register', registration)

export async function logout(token: string) {
  try {
    await apiRequest('/restaurants/auth/logout', { method: 'POST', token })
  } catch {
    // La sesión local ya se cerró; en el servidor el token vence solo.
  }
}

// La sesión dura mientras la pestaña esté abierta. Nunca se guarda la clave.
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    return parsed.token && parsed.name && parsed.username && parsed.restaurantId
      ? {
          token: parsed.token,
          name: parsed.name,
          username: parsed.username,
          restaurantId: parsed.restaurantId,
        }
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
