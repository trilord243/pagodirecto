import { useState, type FormEvent } from 'react'
import {
  login,
  validateCredentials,
  type CredentialErrors,
  type Session,
} from '../lib/auth.ts'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'
import { EyeIcon, EyeOffIcon, LockIcon, UserIcon } from './Icons.tsx'

interface LoginPageProps {
  onLogin: (session: Session) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<CredentialErrors>({})
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = validateCredentials({ username, password })
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    onLogin(await login({ username, password }))
  }

  return (
    <>
      <div className="hero hero--login">
        <Header />
        <div className="hero__content">
          <span className="hero__eyebrow">Portal de comercios</span>
          <h1>Bienvenido de vuelta</h1>
          <p>
            Ingresa para subir el menú de tu comercio y recibir pedidos a
            través del WhatsApp de PagoDirecto.
          </p>
        </div>
      </div>

      <main className="login">
        <form className="card login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card__head">
            <h2>Inicia sesión</h2>
            <p>Usa el usuario de tu comercio.</p>
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
                autoComplete="current-password"
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

          <button
            type="submit"
            className="button button--primary"
            disabled={loading}
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="login-card__note">
            Al ingresar, tu comercio recibe un ID único con el que el agente de
            WhatsApp lo encontrará.
          </p>
        </form>
      </main>

      <Footer />
    </>
  )
}
