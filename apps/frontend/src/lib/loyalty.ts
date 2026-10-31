import { apiRequest } from './api.ts'
import { parsePrice, type Currency } from './menu.ts'
import { formatMoney } from './orders.ts'

// Los mismos límites que aplica el backend.
export const MIN_STAMPS = 2
export const MAX_STAMPS = 20
const MIN_PROMOTION_NAME = 2
export const MAX_PROMOTION_NAME = 80
const MAX_PERCENT = 100
const MAX_MIN_PURCHASES = 1000
const MAX_MIN_TOTAL = 10_000_000

export interface LoyaltyProgram {
  stampsRequired: number
  // Quedan en null si el plato del premio sale del menú.
  rewardItemId: number | null
  rewardName: string | null
  active: boolean
}

export interface LoyaltyCustomer {
  phone: string
  name: string | null
  stamps: number
  purchases: number
  rewardsAvailable: number
}

// Puede haber clientes sin programa: toda compra pagada les abre una tarjeta.
export interface LoyaltyOverview {
  program: LoyaltyProgram | null
  customers: LoyaltyCustomer[]
}

export interface LoyaltyProgramInput {
  stampsRequired: number
  rewardItemId: number
  active: boolean
}

export interface PromotionInput {
  name: string
  percent: number
  minPurchases: number
  minTotal: number
  active: boolean
}

export interface Promotion extends PromotionInput {
  id: number
}

export type PromotionTerms = Pick<
  PromotionInput,
  'percent' | 'minPurchases' | 'minTotal'
>

// Lo que escribe el comercio, tal cual: se valida al crear.
export interface PromotionDraft {
  name: string
  percent: string
  minPurchases: string
  minTotal: string
}

export type PromotionErrors = Partial<Record<keyof PromotionDraft, string>>

export const fetchLoyalty = (token: string, signal: AbortSignal) =>
  apiRequest<LoyaltyOverview>('/restaurants/loyalty', { token, signal })

export const saveLoyalty = (token: string, program: LoyaltyProgramInput) =>
  apiRequest<LoyaltyOverview>('/restaurants/loyalty', {
    method: 'PUT',
    token,
    body: program,
  })

export const fetchPromotions = (token: string, signal: AbortSignal) =>
  apiRequest<Promotion[]>('/restaurants/promotions', { token, signal })

export const createPromotion = (token: string, promotion: PromotionInput) =>
  apiRequest<Promotion>('/restaurants/promotions', {
    method: 'POST',
    token,
    body: promotion,
  })

export const updatePromotion = (
  token: string,
  id: number,
  patch: Partial<PromotionInput>,
) =>
  apiRequest<Promotion>(`/restaurants/promotions/${id}`, {
    method: 'PATCH',
    token,
    body: patch,
  })

export const deletePromotion = (token: string, id: number) =>
  apiRequest<void>(`/restaurants/promotions/${id}`, { method: 'DELETE', token })

const percentage = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 })

export function describePromotion(
  { percent, minPurchases, minTotal }: PromotionTerms,
  currency: Currency,
) {
  const terms = [
    minPurchases > 0 &&
      `para clientes con ${minPurchases} ${minPurchases === 1 ? 'compra' : 'compras'} o más`,
    minTotal > 0 && `en pedidos desde ${formatMoney(minTotal, currency)}`,
  ].filter(Boolean)
  return `${percentage.format(percent)}% ${terms.join(', ') || 'en todos los pedidos'}`
}

// A diferencia de un precio, aquí el cero y el campo vacío sí valen: sin mínimo.
function parseMinTotal(raw: string) {
  if (Number(raw.trim().replace(',', '.')) === 0) return 0
  return parsePrice(raw)
}

function parseMinPurchases(raw: string) {
  const text = raw.trim()
  if (!text) return 0
  return /^\d+$/.test(text) ? Number(text) : null
}

function parsePercent(raw: string) {
  const percent = parsePrice(raw)
  return percent !== null && percent <= MAX_PERCENT ? percent : null
}

export function validatePromotion(draft: PromotionDraft): PromotionErrors {
  const errors: PromotionErrors = {}
  const name = draft.name.trim()
  const minPurchases = parseMinPurchases(draft.minPurchases)
  const minTotal = parseMinTotal(draft.minTotal)

  if (name.length < MIN_PROMOTION_NAME || name.length > MAX_PROMOTION_NAME) {
    errors.name = `Usa de ${MIN_PROMOTION_NAME} a ${MAX_PROMOTION_NAME} caracteres.`
  }
  if (parsePercent(draft.percent) === null) {
    errors.percent = 'Escribe un número mayor que 0 y hasta 100.'
  }
  if (minPurchases === null || minPurchases > MAX_MIN_PURCHASES) {
    errors.minPurchases = `Escribe un número entero hasta ${MAX_MIN_PURCHASES}.`
  }
  if (minTotal === null || minTotal > MAX_MIN_TOTAL) {
    errors.minTotal = 'Monto inválido.'
  }
  return errors
}

// Se llama después de validatePromotion: todos los campos ya son válidos.
export function toPromotionInput(draft: PromotionDraft): PromotionInput {
  return {
    name: draft.name.trim(),
    percent: parsePercent(draft.percent) ?? 0,
    minPurchases: parseMinPurchases(draft.minPurchases) ?? 0,
    minTotal: parseMinTotal(draft.minTotal) ?? 0,
    active: true,
  }
}
