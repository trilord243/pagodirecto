import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage } from '../lib/api.ts'
import {
  login,
  register,
  validateLogin,
  validateRegistration,
  type CredentialErrors,
  type Session,
} from '../lib/auth.ts'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'
import { EyeIcon, EyeOffIcon, LockIcon, UserIcon } from './Icons.tsx'

type Mode = 'login' | 'register'

const COPY = {
  login: {
    title: 'Bienvenido de vuelta',
    lead: 'Ingresa para subir el menú de tu comercio y recibir pedidos a través del WhatsApp de PagoDirecto.',
    heading: 'Inicia sesión',
    hint: 'Usa el usuario de tu comercio.',
    submit: 'Ingresar',
    submitting: 'Ingresando…',
    note: 'Al ingresar, tu comercio recibe un ID único con el que el agente de WhatsApp lo encontrará.',
    switchPrompt: '¿Tu comercio aún no está afiliado?',
    switchAction: 'Afílialo aquí',
  },
  register: {
    title: 'Afilia tu comercio',
    lead: 'Crea tu usuario, sube tu menú y empieza a recibir pedidos a través del WhatsApp de PagoDirecto.',
    heading: 'Crea tu cuenta',
    hint: 'Solo necesitas un usuario y una contraseña.',
    submit: 'Crear cuenta',
    submitting: 'Creando tu cuenta…',
    note: 'Al registrarte, tu comercio recibe un ID único con el que el agente de WhatsApp lo encontrará.',
    switchPrompt: '¿Ya tienes cuenta?',
    switchAction: 'Inicia sesión',
  },
}

interface LoginPageProps {
  notice?: string
  onLogin: (session: Session) => void
}

export function LoginPage({ notice, onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<CredentialErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const copy = COPY[mode]

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login')
    setErrors({})
    setFormError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const credentials = { username, password }
    const next =
      mode === 'login'
        ? validateLogin(credentials)
        : validateRegistration(credentials)
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      onLogin(await (mode === 'login' ? login : register)(credentials))
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors({ username: error.message })
      } else {
        setFormError(errorMessage(error))
      }
      setLoading(false)
    }
  }

  return (
    <>
      <div className="hero hero--login">
        <Header />
        <div className="hero__content">
          <span className="hero__eyebrow">Portal de comercios</span>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </div>
      </div>

      <main className="login">
        <form className="card login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card__head">
            <h2>{copy.heading}</h2>
            <p>{(mode === 'login' && notice) || copy.hint}</p>
          </div>

          <div className={`field ${errors.username ? 'field--error' : ''}`}>
            <label htmlFor="username" className="field__label">
              Usuario
            </label>
            <div className="field__control">
              <span className="field__icon">
                <UserIcon width={20} height={20} />
              </span>
              <input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="arepera.laesquina"
                value={username}
                disabled={loading}
                aria-invalid={Boolean(errors.username)}
                aria-describedby={errors.username ? 'username-error' : undefined}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            {errors.username && (
              <p id="username-error" className="field-error" role="alert">
                {errors.username}
              </p>
            )}
          </div>

          <div className={`field ${errors.password ? 'field--error' : ''}`}>
            <label htmlFor="password" className="field__label">
              Contraseña
            </label>
            <div className="field__control field__control--action">
              <span className="field__icon">
                <LockIcon width={20} height={20} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                placeholder="••••••••"
                value={password}
                disabled={loading}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="field__action"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOffIcon width={20} height={20} />
                ) : (
                  <EyeIcon width={20} height={20} />
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="field-error" role="alert">
                {errors.password}
              </p>
            )}
          </div>

          {formError && (
            <p className="field-error" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="button button--primary"
            disabled={loading}
          >
            {loading ? copy.submitting : copy.submit}
          </button>

          <p className="login-card__note">{copy.note}</p>

          <p className="login-card__switch">
            {copy.switchPrompt}{' '}
            <button type="button" onClick={switchMode} disabled={loading}>
              {copy.switchAction}
            </button>
          </p>
        </form>
      </main>

      <Footer />
    </>
  )
}
