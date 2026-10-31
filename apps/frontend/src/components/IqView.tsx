import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import logo from '../assets/pagodirecto-logo.svg'
import { ApiError, errorMessage } from '../lib/api.ts'
import type { Session } from '../lib/auth.ts'
import { fetchInsights } from '../lib/insights.ts'
import {
  EARLY_ORDERS,
  fetchIq,
  formatOrders,
  type IqDashboard,
  type IqMode,
} from '../lib/iq.ts'
import { IQ_PATH } from '../lib/route.ts'
import { Footer } from './Footer.tsx'
import { AlertIcon, ArrowLeftIcon, LockIcon } from './Icons.tsx'
import { IqBusinessPanel } from './IqBusinessPanel.tsx'
import { IqMarketPanel } from './IqMarketPanel.tsx'
import { LoadState } from './LoadState.tsx'
import './IqView.css'

const PLANS = [
  {
    id: 'negocio',
    label: 'IQ Negocio',
    text: 'Cómo van tus ventas, tus platos y tus clientes.',
  },
  {
    id: 'mercado',
    label: 'IQ Mercado',
    text: 'Cómo vas frente a comercios similares.',
  },
] as const

const SOURCES: { id: IqMode; label: string }[] = [
  { id: 'real', label: 'Mis datos' },
  { id: 'demo', label: 'Ejemplo' },
]

type Plan = (typeof PLANS)[number]['id']

const PLAN_PARAM = 'plan'

// Sin pasar por el historial: cambiar de pestaña no debe llenar el botón atrás.
function readPlan(): Plan {
  const param = new URLSearchParams(window.location.search).get(PLAN_PARAM)
  return param === 'mercado' ? 'mercado' : 'negocio'
}

function writePlan(plan: Plan) {
  const search = plan === 'negocio' ? '' : `?${PLAN_PARAM}=${plan}`
  window.history.replaceState(null, '', `${IQ_PATH}${search}`)
}

function scopeText({ source, periodDays }: IqDashboard) {
  const scope = `pedidos tomados por WhatsApp en los últimos ${periodDays} días`
  return source === 'real'
    ? `Solo ${scope}. Ventas y pedidos no cuentan los cancelados, pero sí los que aún no se han pagado.`
    : `Con datos reales verías solo ${scope}.`
}

function EarlyNotice({ data }: { data: IqDashboard }) {
  const { orders } = data.summary
  if (data.source !== 'real' || orders >= EARLY_ORDERS) return null
  return (
    <p className="iq-notice" role="status">
      <strong>
        {orders === 0
          ? `Aún no tienes pedidos en estos ${data.periodDays} días.`
          : `Tus números aún son tempranos: ${formatOrders(orders)} en ${data.periodDays} días.`}
      </strong>{' '}
      {orders === 0
        ? 'Cuando lleguen por WhatsApp, los verás aquí.'
        : 'Con pocos pedidos, las tendencias todavía pueden cambiar mucho.'}
    </p>
  )
}

interface IqViewProps {
  session: Session
  onBack: () => void
}

export function IqView({ session, onBack }: IqViewProps) {
  const { token } = session
  // null mientras no se sepa si el plan está activo.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [wantsDemo, setWantsDemo] = useState(false)
  const [plan, setPlan] = useState<Plan>(readPlan)
  const [data, setData] = useState<IqDashboard | null>(null)
  // La última petición ya respondida: si no es la actual, hay una en camino.
  const [settled, setSettled] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const mode: IqMode = enabled && !wantsDemo ? 'real' : 'demo'
  const request = `${mode}-${attempt}`
  const loading = !error && settled !== request

  useEffect(() => {
    const previous = document.title
    document.title = 'PagoDirecto IQ'
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchInsights(token, controller.signal).then(
      (insights) => setEnabled(insights.enabled),
      (failure) => {
        if (controller.signal.aborted) return
        setError(errorMessage(failure))
      },
    )
    return () => controller.abort()
  }, [token, attempt])

  useEffect(() => {
    if (enabled === null) return
    const controller = new AbortController()
    fetchIq(token, mode, controller.signal).then(
      (next) => {
        setData(next)
        setError(null)
        setSettled(request)
      },
      (failure) => {
        if (controller.signal.aborted) return
        // El plan pudo vencer después de consultarlo: se vuelve al ejemplo.
        if (
          mode === 'real' &&
          failure instanceof ApiError &&
          failure.status === 403
        ) {
          setEnabled(false)
          return
        }
        setData(null)
        setError(errorMessage(failure))
      },
    )
    return () => controller.abort()
  }, [token, enabled, mode, request])

  function selectPlan(next: Plan) {
    setPlan(next)
    writePlan(next)
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = plan === 'negocio' ? 'mercado' : 'negocio'
    selectPlan(next)
    event.currentTarget
      .querySelector<HTMLElement>(`#iq-tab-${next}`)
      ?.focus()
  }

  function retry() {
    setError(null)
    setAttempt((current) => current + 1)
  }

  // Lo decide la respuesta, no lo pedido: un cuadro en espera sigue siendo el
  // que era, y cualquier valor que no sea 'real' se trata como ejemplo.
  const isDemo = data !== null && data.source !== 'real'
  const { text: planText } = PLANS.find(({ id }) => id === plan) ?? PLANS[0]

  function renderPanel() {
    if (error) {
      return (
        <section className="card">
          <LoadState message={error} onRetry={retry} />
        </section>
      )
    }
    if (!data) {
      return (
        <section className="card">
          <LoadState message="Cargando PagoDirecto IQ…" />
        </section>
      )
    }
    return plan === 'negocio' ? (
      <IqBusinessPanel key={data.source} data={data} />
    ) : (
      <IqMarketPanel key={data.source} data={data} />
    )
  }

  return (
    <div className="iq">
      {/* Persistente y por fuera de las pestañas: una cifra de ejemplo nunca se
          ve sin este aviso, tampoco al desplazarse en un teléfono. */}
      <div className="iq-banner-slot" role="status">
        {isDemo && (
          <p className="iq-banner">
            <AlertIcon width={20} height={20} />
            <span>
              <strong>Cifras de ejemplo.</strong> No son tus ventas reales ni
              datos reales de otros comercios.
            </span>
          </p>
        )}
      </div>

      <div className="hero iq-hero">
        <header className="iq-header">
          <button type="button" className="iq-header__back" onClick={onBack}>
            <ArrowLeftIcon width={18} height={18} />
            <span className="iq-header__back-long">Volver al portal</span>
            <span className="iq-header__back-short">Portal</span>
          </button>
          <span className="iq-header__brand">
            <img src={logo} alt="PagoDirecto" width="150" height="25" />
            <span className="iq-header__iq">IQ</span>
          </span>
          <span className="iq-header__name">{session.name}</span>
        </header>

        <div className="iq-hero__content">
          <h1 ref={heading} tabIndex={-1}>
            PagoDirecto IQ
          </h1>
          <p>{planText}</p>

          <div className="iq-controls">
            <div
              className="segmented iq-tabs"
              role="tablist"
              aria-label="Planes de PagoDirecto IQ"
              onKeyDown={onTabKey}
            >
              {PLANS.map(({ id, label }) => (
                <button
                  key={id}
                  id={`iq-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={plan === id}
                  aria-controls="iq-panel"
                  tabIndex={plan === id ? 0 : -1}
                  className="segmented__option"
                  onClick={() => selectPlan(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {enabled && (
              <div
                className="segmented iq-source"
                role="radiogroup"
                aria-label="Datos que quieres ver"
              >
                {SOURCES.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    className="segmented__option"
                    onClick={() => setWantsDemo(id === 'demo')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {data && <p className="iq-scope">{scopeText(data)}</p>}
        </div>
      </div>

      <main className="iq-main">
        {enabled === false && (
          <section className="card iq-locked">
            <span className="iq-locked__icon">
              <LockIcon width={22} height={22} />
            </span>
            <div>
              <h2>PagoDirecto IQ es un plan de pago</h2>
              <p>
                Todavía no está activo en tu cuenta, por eso aquí ves un ejemplo.
                Con el plan activo verías tus ventas reales.
              </p>
            </div>
          </section>
        )}

        {data && <EarlyNotice data={data} />}

        <div
          id="iq-panel"
          className="iq-panel"
          role="tabpanel"
          aria-labelledby={`iq-tab-${plan}`}
          aria-busy={loading}
        >
          {renderPanel()}
        </div>
      </main>

      <Footer />
    </div>
  )
}
