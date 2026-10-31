import { useEffect, useState } from 'react'
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
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!session) return
    setSessionExpiredHandler(() => {
      clearSession()
      setSession(null)
      setExpired(true)
    })
    return () => setSessionExpiredHandler(null)
  }, [session])

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
    <Portal
      key={session.restaurantId}
      session={session}
      onLogout={() => {
        void logout(session.token)
        clearSession()
        setSession(null)
      }}
    />
  )
}

export default App
