import type { Session } from '../lib/auth.ts'
import { ChatIcon, MenuIcon, UploadIcon } from './Icons.tsx'

interface WelcomeProps {
  session: Session
  onUpload: () => void
}

export function Welcome({ session, onUpload }: WelcomeProps) {
  return (
    <section className="card welcome-card">
      <span className="welcome-card__icon">
        <MenuIcon width={30} height={30} />
      </span>
      <div>
        <span className="welcome-card__eyebrow">¡Hola, {session.username}!</span>
        <h2>Bienvenido a tu portal</h2>
        <p>
          Todavía no tienes un menú activo. Súbelo y el agente de WhatsApp de
          PagoDirecto podrá mostrarlo y tomar pedidos de tus clientes.
        </p>
      </div>

      <div className="welcome-card__id">
        <ChatIcon width={22} height={22} />
        <span>
          <span className="welcome-card__id-label">ID de tu comercio</span>
          <strong>{session.restaurantId}</strong>
          <span className="welcome-card__id-hint">
            Con este ID el agente encuentra tu menú cuando un cliente lo pide.
          </span>
        </span>
      </div>

      <button
        type="button"
        className="button button--primary welcome-card__cta"
        onClick={onUpload}
      >
        <UploadIcon width={20} height={20} /> Subir mi menú
      </button>
    </section>
  )
}
