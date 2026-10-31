import { useState } from 'react'
import { LoginPage } from './components/LoginPage.tsx'
import { Portal } from './Portal.tsx'
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from './lib/auth.ts'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(loadSession)

  if (!session) {
    return (
      <LoginPage
        onLogin={(next) => {
          saveSession(next)
          setSession(next)
        }}
      />
    )
  }

  return (
    <Portal
      key={session.restaurantId}
      session={session}
      onLogout={() => {
        clearSession()
        setSession(null)
      }}
    />
  )
}

export default App
