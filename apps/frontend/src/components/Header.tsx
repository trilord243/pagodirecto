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
        {session && (
          <span className="site-header__user">
            <span className="site-header__name">{session.name}</span>
            <span className="site-header__id">{session.restaurantId}</span>
          </span>
        )}
        <a href="/" className="site-header__brand" aria-label="PagoDirecto">
          <img src={logo} alt="PagoDirecto" width="150" height="25" />
        </a>
        {session ? (
          <button
            type="button"
            className="site-header__logout"
            onClick={onLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogoutIcon width={20} height={20} />
          </button>
        ) : (
          <span className="site-header__tag">Comercios</span>
        )}
      </div>
    </header>
  )
}
