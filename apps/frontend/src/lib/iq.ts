import { apiRequest } from './api.ts'
import type { Currency } from './menu.ts'
import { formatMoney } from './orders.ts'

export type IqMode = 'real' | 'demo'
export type IqUnit = 'money' | 'number' | 'percent'

export interface IqDay {
  date: string
  orders: number
  sales: number
}

export interface IqHour {
  hour: number
  orders: number
}

export interface IqWeekday {
  day: string
  orders: number
}

export interface IqTopItem {
  name: string
  units: number
  sales: number
}

export interface IqBenchmarkMetric {
  key: string
  label: string
  mine: number
  // La mediana del grupo; `benchmark.peers` es cuántos comercios lo forman.
  peers: number
  unit: IqUnit
}

export interface IqDashboard {
  source: IqMode
  currency: Currency
  periodDays: number
  summary: {
    orders: number
    sales: number
    averageTicket: number
    customers: number
    // Entre 0 y 1.
    repeatRate: number
    cancelRate: number
    // Ya vienen en porcentaje (7.38), y son null sin periodo anterior.
    ordersChange: number | null
    salesChange: number | null
  }
  salesByDay: IqDay[]
  ordersByWeekday: IqWeekday[]
  ordersByHour: IqHour[]
  topItems: IqTopItem[]
  unsoldItems: string[]
  customers: {
    new: number
    returning: number
    frequent: number
    atRisk: number
    rewardsPending: number
  }
  benchmark: {
    available: boolean
    reason: string | null
    peers: number
    metrics: IqBenchmarkMetric[]
  }
}

// El backend agrupa días y horas en esta zona, no en la del navegador.
const TIMEZONE = 'America/Caracas'
const DAY_MS = 86_400_000
const WEEK_ORDER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MIN_VISIBLE_HOURS = 8

// El backend limita la lista: con este largo pueden quedar platos por fuera.
export const UNSOLD_LIMIT = 8

// Por debajo de esto las tendencias todavía no dicen mucho.
export const EARLY_ORDERS = 10

export const fetchIq = (token: string, mode: IqMode, signal: AbortSignal) =>
  apiRequest<IqDashboard>(`/restaurants/iq?mode=${mode}`, { token, signal })

const count = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 })
const rate = new Intl.NumberFormat('es-VE', {
  style: 'percent',
  maximumFractionDigits: 0,
})
const change = new Intl.NumberFormat('es-VE', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

// Las fechas llegan como días de calendario: en UTC no se corren un día.
const shortDay = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const longDay = new Intl.DateTimeFormat('es-VE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const cleanDate = (text: string) => text.replaceAll('.', '')

export const formatCount = (value: number) => count.format(value)
export const formatRate = (value: number) => rate.format(value)
// La API lo manda ya en porcentaje: 7.38 significa 7,38 %.
export const formatChange = (value: number) => change.format(value / 100)
export const formatDay = (date: string) =>
  cleanDate(shortDay.format(new Date(`${date}T00:00:00Z`)))
export const formatLongDay = (date: string) =>
  cleanDate(longDay.format(new Date(`${date}T00:00:00Z`)))

export function formatHour(hour: number) {
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${hour < 12 ? 'am' : 'pm'}`
}

export function formatUnit(value: number, unit: IqUnit, currency: Currency) {
  if (unit === 'money') return formatMoney(value, currency)
  return unit === 'percent' ? formatRate(value) : formatCount(value)
}

const plural = (value: number, one: string, many: string) =>
  value === 1 ? one : many

export const formatOrders = (value: number) =>
  `${formatCount(value)} ${plural(value, 'pedido', 'pedidos')}`

export const formatUnits = (value: number) =>
  `${formatCount(value)} ${plural(value, 'ud', 'uds')}`

// Dos porcentajes se comparan en puntos: de 30% a 36% son 6 puntos, no un 20%.
export function describeGap({ mine, peers, unit }: IqBenchmarkMetric) {
  const relative = unit !== 'percent'
  if (relative && peers <= 0) return 'El grupo no tiene una mediana para comparar.'
  const gap = relative ? ((mine - peers) / peers) * 100 : (mine - peers) * 100
  const size = Math.abs(Math.round(gap))
  if (size === 0) return 'Igual que la mediana del grupo.'
  const amount = relative
    ? formatRate(size / 100)
    : `${size} ${plural(size, 'punto', 'puntos')}`
  return `${amount} ${gap > 0 ? 'por encima' : 'por debajo'} de la mediana.`
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS
const dayText = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10)

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

// Los datos reales omiten los días sin pedidos. El periodo son 30 veces 24 horas,
// así que puede tocar 31 fechas: la ventana crece antes que perder ese primer día.
export function fillSalesByDay(days: IqDay[], periodDays: number): IqDay[] {
  const known = days.map(({ date }) => dayNumber(date))
  const end = Math.max(dayNumber(today()), ...known)
  const start = Math.min(end - periodDays + 1, ...known)
  const byDate = new Map(days.map((day) => [day.date, day]))
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const date = dayText(start + index)
    return byDate.get(date) ?? { date, orders: 0, sales: 0 }
  })
}

// La API también omite las horas sin pedidos: sin rellenarlas, las 3 pm quedarían
// pegadas a las 6 pm. Con pocos pedidos se abre el eje para dar contexto.
export function fillHours(hours: IqHour[]): IqHour[] {
  if (hours.length === 0) return []
  const known = hours.map(({ hour }) => hour)
  let first = Math.min(...known)
  let last = Math.max(...known)
  while (last - first + 1 < MIN_VISIBLE_HOURS) {
    if (first > 0) first -= 1
    if (last < 23 && last - first + 1 < MIN_VISIBLE_HOURS) last += 1
  }
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const hour = first + index
    return { hour, orders: hours.find((row) => row.hour === hour)?.orders ?? 0 }
  })
}

// La API arranca en domingo; aquí la semana de un comercio empieza el lunes.
export const sortWeekdays = (days: IqWeekday[]) =>
  [...days].sort(
    (a, b) => WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day),
  )
