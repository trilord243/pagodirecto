import { apiRequest } from './api.ts'
import { MAX_PROMOTION_NAME, type PromotionInput } from './loyalty.ts'

export interface InsightNote {
  titulo: string
  detalle: string
}

export interface SuggestedPromotion {
  nombre: string
  porcentaje: number
  compras_minimas: number
  monto_minimo: number
  motivo: string
}

export interface InsightsReport {
  resumen: string
  hallazgos: InsightNote[]
  mejoras: InsightNote[]
  promociones: SuggestedPromotion[]
}

export interface Insights {
  enabled: boolean
  report: InsightsReport | null
  createdAt: string | null
}

export const fetchInsights = (token: string, signal: AbortSignal) =>
  apiRequest<Insights>('/restaurants/insights', { token, signal })

// Tarda entre 20 y 60 segundos: Claude analiza todas las ventas del comercio.
export const generateInsights = (token: string, signal: AbortSignal) =>
  apiRequest<Insights>('/restaurants/insights', {
    method: 'POST',
    token,
    signal,
  })

// El reporte solo garantiza que son números: la API de promociones exige más.
export const suggestionToPromotion = ({
  nombre,
  porcentaje,
  compras_minimas,
  monto_minimo,
}: SuggestedPromotion): PromotionInput => ({
  name: nombre.trim().slice(0, MAX_PROMOTION_NAME),
  percent: porcentaje,
  minPurchases: Math.max(0, Math.round(compras_minimas)),
  minTotal: Math.max(0, monto_minimo),
  active: true,
})
