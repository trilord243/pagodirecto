import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'

const TREND_HEIGHT = 240
const COLUMN_HEIGHT = 220
const AXIS_BAND = 26
// Deja lugar al valor del pico sin agrandar la escala.
const PLOT_TOP = 30
const TREND_INSET = 8
const COLUMN_GUTTER = 32
const MAX_COLUMN = 24
const COLUMN_GAP = 2
const MIN_TICK_SPACE = 84
// Fechas cada una o dos semanas: siempre caen el mismo día de la semana.
const WIDE_DAY_STEP = 7
const NARROW_DAY_STEP = 14
const MIN_WEEKLY_TICKS = 5
const EDGE_TICK = 26
// Más que esto y el margen le quita demasiado ancho a la línea.
const MAX_GUTTER_SHARE = 0.34
const SPARSE_DAYS = 7
const CHAR_WIDTH = 6.6

export interface ChartRow {
  label: string
  value: string
  // Pinta la raya de la serie junto a la fila.
  series?: 1 | 2
}

export interface ChartPoint {
  tick: string
  title: string
  value: number
  valueLabel: string
  rows: ChartRow[]
}

export interface RankedItem {
  name: string
  value: number
  valueLabel: string
  rows: ChartRow[]
}

export interface ComparisonItem {
  key: string
  label: string
  mine: number
  peers: number
  mineLabel: string
  peersLabel: string
  note: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

function useWidth(target: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)

  // La primera medida llega antes de pintar: no hay un cuadro sin gráfica.
  useLayoutEffect(() => {
    const node = target.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [target])

  return width
}

// Hover, toque y teclado leen lo mismo: el detalle nunca depende del ratón.
function useChartCursor(
  root: RefObject<HTMLElement | null>,
  count: number,
  vertical = false,
) {
  const [active, setActive] = useState<number | null>(null)

  // En un teléfono no hay "salir" del gráfico: tocar fuera cierra el detalle.
  useEffect(() => {
    if (active === null) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [active, root])

  function onKeyDown(event: KeyboardEvent) {
    const last = count - 1
    const forward = Math.min((active ?? -1) + 1, last)
    const back = Math.max((active ?? 1) - 1, 0)
    const targets: Record<string, number> = {
      ArrowRight: forward,
      ArrowLeft: back,
      Home: 0,
      End: last,
      ...(vertical && { ArrowDown: forward, ArrowUp: back }),
    }
    if (event.key === 'Escape') setActive(null)
    if (!(event.key in targets)) return
    event.preventDefault()
    setActive(targets[event.key])
  }

  return {
    active,
    setActive,
    bind: {
      tabIndex: 0,
      onKeyDown,
      onFocus: ({ target }: FocusEvent<HTMLElement>) => {
        if (target.matches(':focus-visible')) {
          setActive((current) => current ?? 0)
        }
      },
      onBlur: () => setActive(null),
      onPointerLeave: ({ pointerType }: ReactPointerEvent) => {
        if (pointerType === 'mouse') setActive(null)
      },
    },
  }
}

// Múltiplos limpios; los conteos nunca muestran medio pedido.
function niceTicks(max: number, integer: boolean) {
  if (max <= 0) return [0, 1]
  const rough = max / 3
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const multiple = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough) ?? 10
  const step = integer
    ? Math.max(1, Math.ceil(multiple * magnitude))
    : multiple * magnitude
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) ticks.push(ticks.length * step)
  return ticks
}

function roundedColumn(x: number, y: number, width: number, base: number) {
  const radius = Math.min(4, width / 2, base - y)
  const right = x + width
  return `M${x} ${base}V${y + radius}Q${x} ${y} ${x + radius} ${y}H${right - radius}Q${right} ${y} ${right} ${y + radius}V${base}Z`
}

const estimateWidth = (text: string) => text.length * CHAR_WIDTH

function TooltipRows({ rows }: { rows: ChartRow[] }) {
  return (
    <dl>
      {rows.map(({ label, value, series }) => (
        <div key={label}>
          {series && (
            <span className={`iq-key iq-key--${series}`} aria-hidden="true" />
          )}
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface PlotTooltipProps {
  point: ChartPoint
  x: number
  width: number
}

// El desplazamiento proporcional lo mantiene dentro del gráfico sin medirlo.
function PlotTooltip({ point, x, width }: PlotTooltipProps) {
  const shift = width > 0 ? (x / width) * 100 : 0
  return (
    <div
      className="iq-tooltip"
      style={{ left: x, transform: `translateX(-${shift}%)` }}
    >
      <strong>{point.title}</strong>
      <TooltipRows rows={point.rows} />
    </div>
  )
}

function Readout({ text }: { text: string }) {
  return (
    <p className="visually-hidden" aria-live="polite">
      {text}
    </p>
  )
}

const describePoint = ({ title, rows }: ChartPoint) =>
  `${title}: ${rows.map(({ label, value }) => `${label} ${value}`).join(', ')}`

interface TrendChartProps {
  label: string
  points: ChartPoint[]
  formatTick: (value: number) => string
}

// Una sola serie sobre el tiempo: línea con lavado, un eje y cursor vertical.
export function TrendChart({ label, points, formatTick }: TrendChartProps) {
  const root = useRef<HTMLDivElement>(null)
  const width = useWidth(root)
  const { active, setActive, bind } = useChartCursor(root, points.length)

  const values = points.map(({ value }) => value)
  const max = Math.max(...values)
  const ticks = niceTicks(max, false)
  const top = ticks[ticks.length - 1]
  const base = TREND_HEIGHT - AXIS_BAND
  // Con montos cortos el eje va al lado y la línea no lo pisa. Si no caben
  // (bolívares en un teléfono) van sobre la rejilla, con halo.
  const labelSpace = Math.max(...ticks.map((tick) => estimateWidth(formatTick(tick))))
  const gutter = labelSpace + 8 <= width * MAX_GUTTER_SHARE ? labelSpace + 8 : 0
  const plotLeft = gutter + TREND_INSET
  const stepX = (width - plotLeft - TREND_INSET) / (points.length - 1)
  const xAt = (index: number) => plotLeft + index * stepX
  const yAt = (value: number) => base - (value / top) * (base - PLOT_TOP)

  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${xAt(index)} ${yAt(value)}`)
    .join('')
  const area = `${line}L${xAt(points.length - 1)} ${base}L${xAt(0)} ${base}Z`

  const dayStep =
    Math.floor(width / MIN_TICK_SPACE) >= MIN_WEEKLY_TICKS
      ? WIDE_DAY_STEP
      : NARROW_DAY_STEP
  const xTicks: number[] = []
  for (let index = points.length - 1; index >= 0; index -= dayStep) {
    xTicks.push(index)
  }

  const peak = values.indexOf(max)
  const peakX = xAt(peak)
  const peakY = yAt(max) - 10
  const peakWidth = estimateWidth(points[peak].valueLabel)
  const peakLeft = clamp(peakX - peakWidth / 2, plotLeft, width - peakWidth)
  const hidesTick = (value: number) => {
    if (gutter > 0 || active !== null) return false
    const overlapsX = peakLeft < estimateWidth(formatTick(value)) + 8
    return overlapsX && Math.abs(yAt(value) - 4 - peakY) < 16
  }

  const sold = values.flatMap((value, index) => (value > 0 ? [index] : []))
  const dots = sold.length <= SPARSE_DAYS ? sold : []

  function track(event: ReactPointerEvent<HTMLDivElement>) {
    const { left } = event.currentTarget.getBoundingClientRect()
    const index = Math.round((event.clientX - left - plotLeft) / stepX)
    setActive(clamp(index, 0, points.length - 1))
  }

  const current = active === null ? null : points[active]

  return (
    <div
      ref={root}
      className="iq-plot"
      role="group"
      aria-roledescription="gráfica"
      aria-label={`${label}. Usa las flechas para recorrerla.`}
      onPointerDown={track}
      onPointerMove={track}
      {...bind}
    >
      {width > 0 && (
        <svg width="100%" height={TREND_HEIGHT} aria-hidden="true">
          {ticks.map((value) => (
            <line
              key={value}
              className={value === 0 ? 'iq-baseline' : 'iq-grid'}
              x1={gutter}
              x2={width}
              y1={yAt(value)}
              y2={yAt(value)}
            />
          ))}
          <path className="iq-area" d={area} />
          <path className="iq-line" d={line} />
          {ticks.map(
            (value) =>
              !hidesTick(value) && (
                <text
                  key={value}
                  className={`iq-tick ${gutter > 0 ? 'iq-tick--plain' : ''}`}
                  x={gutter > 0 ? gutter - 6 : 0}
                  y={yAt(value) + (gutter > 0 ? 4 : -5)}
                  textAnchor={gutter > 0 ? 'end' : 'start'}
                >
                  {formatTick(value)}
                </text>
              ),
          )}
          {xTicks.map((index) => {
            const x = xAt(index)
            const anchor =
              index === points.length - 1
                ? 'end'
                : x - plotLeft < EDGE_TICK
                  ? 'start'
                  : 'middle'
            return (
              <text
                key={index}
                className="iq-tick iq-tick--plain"
                x={x}
                y={TREND_HEIGHT - 8}
                textAnchor={anchor}
              >
                {points[index].tick}
              </text>
            )
          })}
          {dots.map((index) => (
            <circle
              key={index}
              className="iq-dot"
              cx={xAt(index)}
              cy={yAt(values[index])}
              r={4}
            />
          ))}
          {active === null ? (
            <>
              <circle className="iq-dot" cx={peakX} cy={yAt(max)} r={4} />
              <text className="iq-label" x={peakLeft} y={peakY}>
                {points[peak].valueLabel}
              </text>
            </>
          ) : (
            <>
              <line
                className="iq-crosshair"
                x1={xAt(active)}
                x2={xAt(active)}
                y1={PLOT_TOP}
                y2={base}
              />
              <circle
                className="iq-dot"
                cx={xAt(active)}
                cy={yAt(values[active])}
                r={5}
              />
            </>
          )}
        </svg>
      )}
      {current && active !== null && (
        <PlotTooltip point={current} x={xAt(active)} width={width} />
      )}
      <Readout text={current ? describePoint(current) : ''} />
    </div>
  )
}

interface ColumnChartProps {
  label: string
  points: ChartPoint[]
  // Ancho que necesita cada etiqueta del eje X antes de saltarse algunas.
  tickWidth: number
}

// Una sola serie: la columna más alta lleva el color y el resto queda de contexto.
export function ColumnChart({ label, points, tickWidth }: ColumnChartProps) {
  const root = useRef<HTMLDivElement>(null)
  const width = useWidth(root)
  const { active, setActive, bind } = useChartCursor(root, points.length)

  const max = Math.max(...points.map(({ value }) => value))
  const ticks = niceTicks(max, true)
  const top = ticks[ticks.length - 1]
  const base = COLUMN_HEIGHT - AXIS_BAND
  const band = (width - COLUMN_GUTTER) / points.length
  const barWidth = clamp(band - COLUMN_GAP, 2, MAX_COLUMN)
  const center = (index: number) => COLUMN_GUTTER + band * (index + 0.5)
  const yAt = (value: number) => base - (value / top) * (base - PLOT_TOP)
  const every = Math.max(1, Math.ceil(tickWidth / band))
  const peak = points.findIndex(({ value }) => value === max)

  function track(event: ReactPointerEvent<HTMLDivElement>) {
    const { left } = event.currentTarget.getBoundingClientRect()
    const index = Math.floor((event.clientX - left - COLUMN_GUTTER) / band)
    setActive(clamp(index, 0, points.length - 1))
  }

  const current = active === null ? null : points[active]

  return (
    <div
      ref={root}
      className="iq-plot"
      role="group"
      aria-roledescription="gráfica"
      aria-label={`${label}. Usa las flechas para recorrerla.`}
      onPointerDown={track}
      onPointerMove={track}
      {...bind}
    >
      {width > 0 && (
        <svg width="100%" height={COLUMN_HEIGHT} aria-hidden="true">
          {ticks.map((value) => (
            <g key={value}>
              <line
                className={value === 0 ? 'iq-baseline' : 'iq-grid'}
                x1={COLUMN_GUTTER}
                x2={width}
                y1={yAt(value)}
                y2={yAt(value)}
              />
              <text
                className="iq-tick iq-tick--plain"
                x={COLUMN_GUTTER - 6}
                y={yAt(value) + 4}
                textAnchor="end"
              >
                {value}
              </text>
            </g>
          ))}
          {points.map(({ tick, value }, index) => {
            const x = center(index) - barWidth / 2
            // Un valor mínimo se ve; el cero no dibuja nada.
            const y = value > 0 ? Math.min(yAt(value), base - 2) : base
            const tone = value === max ? 'iq-column--peak' : ''
            const state = active === index ? 'iq-column--active' : ''
            return (
              <g key={tick}>
                {value > 0 && (
                  <path
                    className={`iq-column ${tone} ${state}`}
                    d={roundedColumn(x, y, barWidth, base)}
                  />
                )}
                {index % every === 0 && (
                  <text
                    className="iq-tick iq-tick--plain"
                    x={clamp(
                      center(index),
                      estimateWidth(tick) / 2,
                      width - estimateWidth(tick) / 2,
                    )}
                    y={COLUMN_HEIGHT - 8}
                    textAnchor="middle"
                  >
                    {tick}
                  </text>
                )}
              </g>
            )
          })}
          {active === null && (
            <text
              className="iq-label"
              x={center(peak)}
              y={yAt(max) - 8}
              textAnchor="middle"
            >
              {points[peak].valueLabel}
            </text>
          )}
        </svg>
      )}
      {current && active !== null && (
        <PlotTooltip point={current} x={center(active)} width={width} />
      )}
      <Readout text={current ? describePoint(current) : ''} />
    </div>
  )
}

interface RankedBarsProps {
  label: string
  items: RankedItem[]
}

// Barras en una sola línea base: comparan mejor que un pastel o un donut.
export function RankedBars({ label, items }: RankedBarsProps) {
  const root = useRef<HTMLDivElement>(null)
  const { active, setActive, bind } = useChartCursor(root, items.length, true)
  const max = Math.max(...items.map(({ value }) => value), 1)
  const current = active === null ? null : items[active]

  return (
    <div
      ref={root}
      className="iq-rows"
      role="group"
      aria-roledescription="gráfica"
      aria-label={`${label}. Usa las flechas para recorrerla.`}
      {...bind}
    >
      <ol className="iq-ranked">
        {items.map(({ name, value, valueLabel, rows }, index) => (
          <li
            key={`${name}-${index}`}
            className={active === index ? 'iq-row--active' : undefined}
            onPointerEnter={() => setActive(index)}
            onPointerDown={() => setActive(index)}
          >
            <span className="iq-ranked__name">{name}</span>
            <span className="iq-ranked__value">{valueLabel}</span>
            <span className="iq-ranked__track" aria-hidden="true">
              <span
                className="iq-bar iq-bar--1"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </span>
            {active === index && (
              <div className="iq-tooltip iq-tooltip--row">
                <strong>{name}</strong>
                <TooltipRows rows={rows} />
              </div>
            )}
          </li>
        ))}
      </ol>
      <Readout
        text={
          current
            ? `${current.name}: ${current.rows
                .map(({ label: name, value }) => `${name} ${value}`)
                .join(', ')}`
            : ''
        }
      />
    </div>
  )
}

interface ComparisonBarsProps {
  label: string
  items: ComparisonItem[]
}

// Cada métrica tiene su unidad, así que cada fila usa su propia escala desde cero.
export function ComparisonBars({ label, items }: ComparisonBarsProps) {
  const root = useRef<HTMLDivElement>(null)
  const { active, setActive, bind } = useChartCursor(root, items.length, true)
  const current = active === null ? null : items[active]

  return (
    <div
      ref={root}
      className="iq-rows"
      role="group"
      aria-roledescription="gráfica"
      aria-label={`${label}. Usa las flechas para recorrerla.`}
      {...bind}
    >
      <ul className="iq-compare">
        {items.map((item, index) => {
          const scale = Math.max(item.mine, item.peers, Number.EPSILON)
          return (
            <li
              key={item.key}
              className={active === index ? 'iq-row--active' : undefined}
              onPointerEnter={() => setActive(index)}
              onPointerDown={() => setActive(index)}
            >
              <h3>{item.label}</h3>
              <div className="iq-compare__row">
                <span>Tú</span>
                <span className="iq-compare__track" aria-hidden="true">
                  <span
                    className="iq-bar iq-bar--1"
                    style={{ width: `${(item.mine / scale) * 100}%` }}
                  />
                </span>
                <strong>{item.mineLabel}</strong>
              </div>
              <div className="iq-compare__row">
                <span>Mediana</span>
                <span className="iq-compare__track" aria-hidden="true">
                  <span
                    className="iq-bar iq-bar--2"
                    style={{ width: `${(item.peers / scale) * 100}%` }}
                  />
                </span>
                <strong>{item.peersLabel}</strong>
              </div>
              <p>{item.note}</p>
              {active === index && (
                <div className="iq-tooltip iq-tooltip--row">
                  <strong>{item.label}</strong>
                  <TooltipRows
                    rows={[
                      { label: 'Tú', value: item.mineLabel, series: 1 },
                      {
                        label: 'Mediana del grupo',
                        value: item.peersLabel,
                        series: 2,
                      },
                    ]}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Readout
        text={
          current
            ? `${current.label}: tú ${current.mineLabel}, mediana del grupo ${current.peersLabel}. ${current.note}`
            : ''
        }
      />
    </div>
  )
}

export function ChartLegend({ items }: { items: { label: string; series: 1 | 2 }[] }) {
  return (
    <ul className="iq-legend">
      {items.map(({ label, series }) => (
        <li key={label}>
          <span className={`iq-swatch iq-swatch--${series}`} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  )
}

export function DemoTag() {
  return <span className="iq-tag">Ejemplo</span>
}

interface DataTableProps {
  caption: string
  columns: string[]
  rows: string[][]
}

export function DataTable({ caption, columns, rows }: DataTableProps) {
  return (
    <div className="iq-table">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest]) => (
            <tr key={first}>
              <th scope="row">{first}</th>
              {rest.map((cell, index) => (
                <td key={columns[index + 1]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ChartCardProps {
  title: string
  subtitle?: string
  demo: boolean
  className?: string
  // La tabla gemela de la gráfica. Sin ella, la tarjeta no ofrece el cambio.
  table?: ReactNode
  children: ReactNode
}

export function ChartCard({
  title,
  subtitle,
  demo,
  className = '',
  table,
  children,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={`card iq-card ${className}`}>
      <div className="iq-card__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {demo && <DemoTag />}
      </div>
      {asTable ? table : children}
      {table && (
        <button
          type="button"
          className="text-button iq-card__toggle"
          aria-pressed={asTable}
          onClick={() => setAsTable((current) => !current)}
        >
          {asTable ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      )}
    </section>
  )
}
