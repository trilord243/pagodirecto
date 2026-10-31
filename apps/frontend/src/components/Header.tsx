import logo from '../assets/pagodirecto-logo.svg'
import type { Session } from '../lib/auth.ts'
import { LogoutIcon } from './Icons.tsx'

interface HeaderProps {
  session?: Session
  onLogout?: () => void
}

export function Header({ session, onLogout }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__bar">
        <a href="/" className="site-header__brand" aria-label="PagoDirecto">
          <img src={logo} alt="PagoDirecto" width="150" height="25" />
        </a>
        {session ? (
          <div className="site-header__session">
            <span className="site-header__user">
              <span className="site-header__username">{session.username}</span>
              <span className="site-header__id">ID {session.restaurantId}</span>
            </span>
            <button
              type="button"
              className="site-header__logout"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogoutIcon width={20} height={20} />
            </button>
          </div>
        ) : (
          <span className="site-header__tag">Comercios</span>
        )}
      </div>
    </header>
  )
}
