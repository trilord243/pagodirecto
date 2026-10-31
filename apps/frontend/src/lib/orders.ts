import { apiRequest } from './api.ts'
import { CURRENCY_SYMBOL, type Currency } from './menu.ts'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready'
  | 'delivered'
  | 'cancelled'

export type PaymentStatus = 'pending' | 'paid'

export interface Order {
  id: number
  customer_name: string
  customer_phone: string
  notes: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: 'wallet' | null
  refunded: boolean
  subtotal: number
  discount: number
  promotion_name: string | null
  reward_redeemed: boolean
  total: number
  currency: Currency
  created_at: string
  // Un plato con unit_price 0 es el premio de la tarjeta de fidelidad.
  items: { name: string; quantity: number; unit_price: number }[]
}

export interface OrderPatch {
  status?: OrderStatus
  paymentStatus?: PaymentStatus
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const fetchOrders = (token: string, signal: AbortSignal) =>
  apiRequest<Order[]>('/restaurants/orders', { token, signal })

export const updateOrder = (token: string, id: number, patch: OrderPatch) =>
  apiRequest<Order>(`/restaurants/orders/${id}`, {
    method: 'PATCH',
    token,
    body: patch,
  })

const amount = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const orderDate = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

// Con espacio duro: el símbolo no se separa del monto al partir la línea.
export const formatMoney = (value: number, currency: Currency) =>
  `${CURRENCY_SYMBOL[currency]} ${amount.format(value)}`

export const formatOrderDate = (iso: string) => orderDate.format(new Date(iso))
