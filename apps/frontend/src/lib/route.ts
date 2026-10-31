import { useSyncExternalStore } from 'react'

export const IQ_PATH = '/iq'
export const PORTAL_PATH = '/'

const listeners = new Set<() => void>()

// popstate cubre el botón atrás; pushState no lo dispara, por eso `navigate` avisa.
function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function navigate(path: string) {
  window.history.pushState(null, '', path)
  listeners.forEach((listener) => listener())
}

export const usePathname = () =>
  useSyncExternalStore(subscribe, () => window.location.pathname)

export const isIqPath = (pathname: string) =>
  pathname.replace(/\/+$/, '') === IQ_PATH
