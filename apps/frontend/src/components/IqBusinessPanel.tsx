import {
  UNSOLD_LIMIT,
  fillHours,
  fillSalesByDay,
  formatChange,
  formatCount,
  formatDay,
  formatHour,
  formatLongDay,
  formatRate,
  formatUnits,
  sortWeekdays,
  type IqDashboard,
} from '../lib/iq.ts'
import { formatMoney } from '../lib/orders.ts'
import {
  ChartCard,
  ColumnChart,
  DataTable,
  DemoTag,
  RankedBars,
  TrendChart,
  type ChartPoint,
} from './IqCharts.tsx'

const NO_ORDERS = 'Sin pedidos en este periodo.'
const HOUR_TICK_WIDTH = 44
const DAY_TICK_WIDTH = 28
// Un monto en bolívares no cabe a tamaño completo y no debe partirse.
const LONG_VALUE = 11
const LONGER_VALUE = 15

interface Tile {
  label: string
  value: string
  // undefined: la API no compara este dato. null: no hay periodo anterior.
  change?: number | null
}

function Delta({ change, periodDays }: { change: number | null; periodDays: number }) {
  if (change === null) {
    return <p className="iq-tile__delta">Sin periodo anterior</p>
  }
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  const arrow = { up: '↑', down: '↓', flat: '=' }[direction]
  return (
    <p className={`iq-tile__delta iq-tile__delta--${direction}`}>
      <span aria-hidden="true">{arrow}</span> {formatChange(change)} vs.{' '}
      {periodDays} días anteriores
    </p>
  )
}

function valueSize({ length }: string) {
  if (length > LONGER_VALUE) return 'iq-tile__value--longer'
  return length > LONG_VALUE ? 'iq-tile__value--long' : ''
}

// Un pico compartido no es un pico: no se nombra un ganador que no existe.
function peakOf<Row>(rows: Row[], orders: (row: Row) => number) {
  const max = Math.max(...rows.map(orders))
  const peaks = rows.filter((row) => orders(row) === max)
  return max > 0 && peaks.length === 1 ? peaks[0] : null
}

export function IqBusinessPanel({ data }: { data: IqDashboard }) {
  const { currency, periodDays, summary, customers } = data
  const demo = data.source !== 'real'
  const money = (value: number) => formatMoney(value, currency)
  const period = `estos ${periodDays} días`

  const days = fillSalesByDay(data.salesByDay, periodDays)
  const weekdays = sortWeekdays(data.ordersByWeekday)
  const hours = fillHours(data.ordersByHour)
  const hasDays = days.some(({ orders }) => orders > 0)
  const hasWeekdays = weekdays.some(({ orders }) => orders > 0)
  const hasHours = hours.some(({ orders }) => orders > 0)

  const bestDay = peakOf(days, ({ sales }) => sales)
  const bestWeekday = peakOf(weekdays, ({ orders }) => orders)
  const bestHour = peakOf(hours, ({ orders }) => orders)

  const tiles: Tile[] = [
    { label: 'Ventas', value: money(summary.sales), change: summary.salesChange },
    {
      label: 'Pedidos',
      value: formatCount(summary.orders),
      change: summary.ordersChange,
    },
    { label: 'Ticket promedio', value: money(summary.averageTicket) },
    { label: 'Clientes', value: formatCount(summary.customers) },
    { label: '% que repiten', value: formatRate(summary.repeatRate) },
    { label: 'Cancelados', value: formatRate(summary.cancelRate) },
  ]

  const dayPoints: ChartPoint[] = days.map(({ date, orders, sales }) => ({
    tick: formatDay(date),
    title: formatLongDay(date),
    value: sales,
    valueLabel: money(sales),
    rows: [
      { label: 'Ventas', value: money(sales), series: 1 },
      { label: 'Pedidos', value: formatCount(orders) },
    ],
  }))

  const weekdayPoints: ChartPoint[] = weekdays.map(({ day, orders }) => ({
    tick: day,
    title: day,
    value: orders,
    valueLabel: formatCount(orders),
    rows: [{ label: 'Pedidos', value: formatCount(orders), series: 1 }],
  }))

  const hourPoints: ChartPoint[] = hours.map(({ hour, orders }) => ({
    tick: formatHour(hour),
    title: `De ${formatHour(hour)} a ${formatHour((hour + 1) % 24)}`,
    value: orders,
    valueLabel: formatCount(orders),
    rows: [{ label: 'Pedidos', value: formatCount(orders), series: 1 }],
  }))

  const customerStats = [
    {
      label: 'Nuevos',
      value: customers.new,
      text: `Primer pedido en ${period}.`,
    },
    {
      label: 'Que repiten',
      value: customers.returning,
      text: 'Han pedido más de una vez.',
    },
    {
      label: 'Frecuentes',
      value: customers.frequent,
      text: 'Llevan 4 pedidos o más.',
    },
    {
      label: 'En riesgo',
      value: customers.atRisk,
      text: 'Repiten, pero llevan más de 21 días sin pedir.',
    },
    {
      label: 'Premios sin usar',
      value: customers.rewardsPending,
      text: 'De tu tarjeta de fidelidad. Son premios, no clientes.',
    },
  ]

  return (
    <div className="iq-business">
      <section className="iq-summary" aria-labelledby="iq-summary-title">
        <div className="iq-summary__head">
          <h2 id="iq-summary-title">Resumen de {period}</h2>
          {demo && <DemoTag />}
        </div>
        <ul className="iq-tiles">
          {tiles.map(({ label, value, change }) => (
            <li key={label} className="iq-tile">
              <span className="iq-tile__label">{label}</span>
              <span className={`iq-tile__value ${valueSize(value)}`}>
                {value}
              </span>
              {change !== undefined && (
                <Delta change={change} periodDays={periodDays} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <ChartCard
        className="iq-wide"
        title="Ventas por día"
        subtitle={
          bestDay
            ? `Tu mejor día: ${formatLongDay(bestDay.date)}, con ${money(bestDay.sales)}.`
            : undefined
        }
        demo={demo}
        table={
          hasDays && (
            <DataTable
              caption="Ventas y pedidos por día"
              columns={['Día', 'Pedidos', 'Ventas']}
              rows={days.map(({ date, orders, sales }) => [
                formatLongDay(date),
                formatCount(orders),
                money(sales),
              ])}
            />
          )
        }
      >
        {hasDays ? (
          <TrendChart
            label="Ventas por día"
            points={dayPoints}
            formatTick={money}
          />
        ) : (
          <p className="iq-empty">{NO_ORDERS}</p>
        )}
      </ChartCard>

      <ChartCard
        title="Pedidos por día de la semana"
        subtitle={
          bestWeekday
            ? `Tu día más fuerte: ${bestWeekday.day}.`
            : hasWeekdays
              ? 'Ningún día destaca sobre los demás.'
              : undefined
        }
        demo={demo}
        table={
          hasWeekdays && (
            <DataTable
              caption="Pedidos por día de la semana"
              columns={['Día', 'Pedidos']}
              rows={weekdays.map(({ day, orders }) => [
                day,
                formatCount(orders),
              ])}
            />
          )
        }
      >
        {hasWeekdays ? (
          <ColumnChart
            label="Pedidos por día de la semana"
            points={weekdayPoints}
            tickWidth={DAY_TICK_WIDTH}
          />
        ) : (
          <p className="iq-empty">{NO_ORDERS}</p>
        )}
      </ChartCard>

      <ChartCard
        title="Pedidos por hora"
        subtitle={
          bestHour
            ? `Hora de Venezuela. Tu hora más fuerte: ${formatHour(bestHour.hour)}.`
            : 'Hora de Venezuela.'
        }
        demo={demo}
        table={
          hasHours && (
            <DataTable
              caption="Pedidos por hora"
              columns={['Hora', 'Pedidos']}
              rows={hours.map(({ hour, orders }) => [
                formatHour(hour),
                formatCount(orders),
              ])}
            />
          )
        }
      >
        {hasHours ? (
          <ColumnChart
            label="Pedidos por hora"
            points={hourPoints}
            tickWidth={HOUR_TICK_WIDTH}
          />
        ) : (
          <p className="iq-empty">{NO_ORDERS}</p>
        )}
      </ChartCard>

      <ChartCard
        title="Platos más vendidos"
        subtitle={
          demo
            ? 'Los nombres pueden ser los de tu menú, pero las cantidades son inventadas.'
            : `Por unidades vendidas en ${period}.`
        }
        demo={demo}
      >
        {data.topItems.length > 0 ? (
          <RankedBars
            label="Platos más vendidos"
            items={data.topItems.map(({ name, units, sales }) => ({
              name,
              value: units,
              valueLabel: `${formatUnits(units)} · ${money(sales)}`,
              rows: [
                { label: 'Unidades', value: formatCount(units), series: 1 },
                { label: 'Ventas', value: money(sales) },
              ],
            }))}
          />
        ) : (
          <p className="iq-empty">Aún no hay platos vendidos.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Platos sin ventas"
        subtitle={
          demo
            ? 'Es un ejemplo: no significa que estos platos no se vendan.'
            : `Disponibles en tu menú y sin pedidos en ${period}.`
        }
        demo={demo}
      >
        {data.unsoldItems.length > 0 ? (
          <>
            <ul className="iq-unsold">
              {data.unsoldItems.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            {data.unsoldItems.length >= UNSOLD_LIMIT && (
              <p className="iq-note">
                Mostramos los primeros {UNSOLD_LIMIT}. Puede haber más.
              </p>
            )}
          </>
        ) : (
          <p className="iq-empty">No hay platos sin ventas en este periodo.</p>
        )}
      </ChartCard>

      <ChartCard
        className="iq-wide"
        title="Clientes"
        subtitle="Mira todo tu historial de pedidos por WhatsApp, no solo este periodo. Un cliente puede estar en más de un grupo."
        demo={demo}
      >
        <ul className="iq-stats">
          {customerStats.map(({ label, value, text }) => (
            <li key={label}>
              <span className="iq-stats__value">{formatCount(value)}</span>
              <span className="iq-stats__label">{label}</span>
              <span className="iq-stats__text">{text}</span>
            </li>
          ))}
        </ul>
      </ChartCard>
    </div>
  )
}
