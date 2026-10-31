import { useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../lib/api.ts'
import {
  fetchInsights,
  generateInsights,
  suggestionToPromotion,
  type InsightNote,
  type Insights,
  type InsightsReport,
  type SuggestedPromotion,
} from '../lib/insights.ts'
import {
  createPromotion,
  describePromotion,
  fetchPromotions,
  type Promotion,
  type PromotionInput,
} from '../lib/loyalty.ts'
import type { Currency } from '../lib/menu.ts'
import { formatOrderDate } from '../lib/orders.ts'
import { CheckIcon, LockIcon } from './Icons.tsx'
import { LoadState } from './LoadState.tsx'
import { LoyaltyEye } from './LoyaltyCard.tsx'
import './AdvisorView.css'

const LOCKED_BENEFITS = [
  'Qué platos, días y horas te dejan más ventas.',
  'Mejoras concretas que puedes hacer esta semana.',
  'Promociones pensadas para tu negocio, listas para crear.',
]

// Mismo nombre con otras condiciones es otra promoción: aún se puede crear.
const isSamePromotion = (a: Promotion, b: PromotionInput) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
  a.percent === b.percent &&
  a.minPurchases === b.minPurchases &&
  a.minTotal === b.minTotal

interface AdvisorViewProps {
  token: string
  currency: Currency
  // Portal lo deja montado para que un análisis en curso no se pierda.
  visible: boolean
}

export function AdvisorView({ token, currency, visible }: AdvisorViewProps) {
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const activeAnalysis = useRef<AbortController | null>(null)
  const enabled = insights?.enabled ?? false

  useEffect(() => {
    const controller = new AbortController()
    fetchInsights(token, controller.signal).then(setInsights, (error) => {
      if (controller.signal.aborted) return
      setLoadError(errorMessage(error))
    })
    return () => controller.abort()
  }, [token, attempt])

  // Al volver a la pestaña: pudo crear o borrar promociones en Fidelidad.
  useEffect(() => {
    if (!enabled || !visible) return
    const controller = new AbortController()
    fetchPromotions(token, controller.signal).then(setPromotions, () => {
      // Solo evita repetir sugerencias: sin esto el reporte sigue funcionando.
    })
    return () => controller.abort()
  }, [token, enabled, visible])

  useEffect(() => () => activeAnalysis.current?.abort(), [])

  async function analyze() {
    const controller = new AbortController()
    activeAnalysis.current = controller
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      setInsights(await generateInsights(token, controller.signal))
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.status === 403) {
        setInsights((current) => current && { ...current, enabled: false })
      } else {
        setAnalyzeError(errorMessage(error))
      }
    } finally {
      setAnalyzing(false)
    }
  }

  if (loadError) {
    return (
      <section className="card">
        <LoadState
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            setAttempt((current) => current + 1)
          }}
        />
      </section>
    )
  }

  if (!insights) {
    return (
      <section className="card">
        <LoadState message="Cargando tu asesor…" />
      </section>
    )
  }

  if (!insights.enabled) return <AdvisorLocked />

  const { report, createdAt } = insights

  return (
    <div className="advisor">
      <section className="card advisor__start">
        <div className="advisor__head">
          <h2>Asesor de negocio</h2>
          <p>
            Revisa tus pedidos, tu tarjeta y tus promociones, y te dice qué hacer
            para vender más.
          </p>
        </div>

        {analyzing ? (
          <AdvisorLoading />
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={analyze}
          >
            {report ? 'Analizar de nuevo' : 'Analizar mi negocio'}
          </button>
        )}

        {analyzeError && (
          <p className="field-error" role="alert">
            {analyzeError}
          </p>
        )}

        <p className="field__hint">
          {createdAt && `Último análisis: ${formatOrderDate(createdAt)} · `}
          Puedes pedir hasta 3 análisis al día.
        </p>
      </section>

      {report && (
        <AdvisorReport
          report={report}
          token={token}
          currency={currency}
          promotions={promotions}
          onCreated={(created) =>
            setPromotions((current) => [created, ...current])
          }
        />
      )}
    </div>
  )
}

function AdvisorLocked() {
  return (
    <section className="card advisor-locked">
      <span className="advisor-locked__icon">
        <LockIcon width={28} height={28} />
      </span>
      <h2>El asesor de negocio es un complemento de pago</h2>
      <p>
        Analiza las ventas de tu comercio y te sugiere promociones para vender
        más y recuperar clientes.
      </p>
      <ul className="advisor-locked__list">
        {LOCKED_BENEFITS.map((benefit) => (
          <li key={benefit}>
            <CheckIcon width={16} height={16} />
            {benefit}
          </li>
        ))}
      </ul>
      <p className="field__hint">Todavía no está activo en tu cuenta.</p>
    </section>
  )
}

function AdvisorLoading() {
  return (
    <div className="advisor-loading" role="status">
      <span className="advisor-loading__eyes" aria-hidden="true">
        <LoyaltyEye filled />
        <LoyaltyEye filled />
        <LoyaltyEye filled />
      </span>
      <strong>Analizando tus ventas…</strong>
      <span>
        Puede tardar hasta un minuto. Puedes seguir usando el portal mientras
        tanto.
      </span>
    </div>
  )
}

interface AdvisorReportProps {
  report: InsightsReport
  token: string
  currency: Currency
  promotions: Promotion[]
  onCreated: (promotion: Promotion) => void
}

function AdvisorReport({
  report,
  token,
  currency,
  promotions,
  onCreated,
}: AdvisorReportProps) {
  const { resumen, hallazgos, mejoras, promociones } = report

  return (
    <section className="card advisor-report">
      <div className="advisor-report__summary">
        <h2>Resumen</h2>
        <p>{resumen}</p>
      </div>

      <NoteList title="Lo que muestran tus datos" notes={hallazgos} />
      <NoteList title="Qué mejorar esta semana" notes={mejoras} />

      {promociones.length > 0 && (
        <div className="advisor-report__block">
          <h3>Promociones sugeridas</h3>
          <ul className="advisor-suggestions">
            {promociones.map((suggestion, index) => (
              <SuggestionCard
                key={`${suggestion.nombre}-${index}`}
                suggestion={suggestion}
                token={token}
                currency={currency}
                promotions={promotions}
                onCreated={onCreated}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function NoteList({ title, notes }: { title: string; notes: InsightNote[] }) {
  if (notes.length === 0) return null
  return (
    <div className="advisor-report__block">
      <h3>{title}</h3>
      <ul className="advisor-notes">
        {notes.map((note, index) => (
          <li key={`${note.titulo}-${index}`}>
            <strong>{note.titulo}</strong>
            <span>{note.detalle}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface SuggestionCardProps {
  suggestion: SuggestedPromotion
  token: string
  currency: Currency
  promotions: Promotion[]
  onCreated: (promotion: Promotion) => void
}

function SuggestionCard({
  suggestion,
  token,
  currency,
  promotions,
  onCreated,
}: SuggestionCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const promotion = suggestionToPromotion(suggestion)
  const exists = promotions.some((current) =>
    isSamePromotion(current, promotion),
  )

  async function create() {
    setSaving(true)
    setError(null)
    try {
      onCreated(await createPromotion(token, promotion))
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="advisor-suggestion">
      <span className="advisor-suggestion__name">{suggestion.nombre}</span>
      <span className="advisor-suggestion__terms">
        {describePromotion(promotion, currency)}
      </span>
      <p className="advisor-suggestion__reason">{suggestion.motivo}</p>

      {exists ? (
        <p className="advisor-suggestion__done" role="status">
          <CheckIcon width={14} height={14} /> Ya la creaste. La manejas en
          Fidelidad.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="advisor-suggestion__create"
            disabled={saving}
            onClick={create}
          >
            {saving ? 'Creando…' : 'Crear esta promoción'}
          </button>
          <span className="field__hint">Queda activa para tus clientes.</span>
        </>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
