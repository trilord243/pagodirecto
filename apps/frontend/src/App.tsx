import { Fragment, useEffect, useRef, useState } from 'react'
import { IqView } from './components/IqView.tsx'
import { LoginPage } from './components/LoginPage.tsx'
import { Portal } from './Portal.tsx'
import { setSessionExpiredHandler } from './lib/api.ts'
import {
  clearSession,
  loadSession,
  logout,
  saveSession,
  type Session,
} from './lib/auth.ts'
import { IQ_PATH, PORTAL_PATH, isIqPath, navigate, usePathname } from './lib/route.ts'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [expired, setExpired] = useState(false)
  const iqOpen = isIqPath(usePathname())
  // El botón que abrió IQ: al volver, el foco regresa a él.
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!session) return
    setSessionExpiredHandler(() => {
      clearSession()
      setSession(null)
      setExpired(true)
    })
    return () => setSessionExpiredHandler(null)
  }, [session])

  useEffect(() => {
    if (iqOpen) return
    opener.current?.focus()
    opener.current = null
  }, [iqOpen])

  function openIq() {
    opener.current = document.activeElement as HTMLElement | null
    navigate(IQ_PATH)
  }

  if (!session) {
    return (
      <LoginPage
        notice={expired ? 'Tu sesión venció. Ingresa de nuevo.' : undefined}
        onLogin={(next) => {
          saveSession(next)
          setSession(next)
          setExpired(false)
        }}
      />
    )
  }

  return (
    <Fragment key={session.restaurantId}>
      {/* Oculto y no desmontado: un análisis o una edición siguen vivos en IQ. */}
      <div hidden={iqOpen}>
        <Portal
          session={session}
          onOpenIq={openIq}
          onLogout={() => {
            void logout(session.token)
            clearSession()
            setSession(null)
          }}
        />
      </div>
      {iqOpen && (
        <IqView session={session} onBack={() => navigate(PORTAL_PATH)} />
      )}
    </Fragment>
  )
}

export default App
