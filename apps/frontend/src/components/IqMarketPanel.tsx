import { describeGap, formatCount, formatUnit, type IqDashboard } from '../lib/iq.ts'
import {
  ChartCard,
  ChartLegend,
  ComparisonBars,
  DemoTag,
} from './IqCharts.tsx'

const PRIVACY =
  'Solo se comparten medianas anónimas, nunca nombres, clientes ni ventas individuales.'
const NO_REASON = 'La comparación no está disponible por ahora.'
const LEGEND = [
  { label: 'Tú', series: 1 },
  { label: 'Mediana del grupo', series: 2 },
] as const

export function IqMarketPanel({ data }: { data: IqDashboard }) {
  const { benchmark, currency } = data
  const demo = data.source !== 'real'

  if (!benchmark.available || benchmark.metrics.length === 0) {
    return (
      <section className="card iq-unavailable">
        <div className="iq-card__head">
          <h2>Aún no podemos compararte</h2>
          {demo && <DemoTag />}
        </div>
        <p className="iq-unavailable__reason">
          {benchmark.reason || NO_REASON}
        </p>
        <p>
          Preferimos no mostrar nada antes que delatar a otro comercio. Tus
          propios números siguen en IQ Negocio.
        </p>
      </section>
    )
  }

  const { peers } = benchmark

  return (
    <div className="iq-market">
      <section className="card iq-group">
        <div className="iq-card__head">
          <div>
            <h2>
              {demo
                ? `Grupo de ejemplo: ${formatCount(peers)} comercios inventados`
                : `Te comparas con ${formatCount(peers)} comercios similares`}
            </h2>
            <p>
              {demo
                ? 'Con datos reales, el grupo serían comercios activos de PagoDirecto que venden en tu misma moneda.'
                : 'Comercios activos de PagoDirecto que venden en tu misma moneda y tuvieron pedidos en este periodo.'}
            </p>
          </div>
          {demo && <DemoTag />}
        </div>
        <p className="iq-group__privacy">{PRIVACY}</p>
      </section>

      <ChartCard
        title="Tú frente a la mediana del grupo"
        subtitle="La mediana es el valor del medio: la mitad del grupo queda por encima y la otra mitad por debajo."
        demo={demo}
      >
        <ChartLegend items={[...LEGEND]} />
        <ComparisonBars
          label="Tú frente a la mediana del grupo"
          items={benchmark.metrics.map((metric) => ({
            key: metric.key,
            label: metric.label,
            mine: metric.mine,
            peers: metric.peers,
            mineLabel: formatUnit(metric.mine, metric.unit, currency),
            peersLabel: formatUnit(metric.peers, metric.unit, currency),
            note: describeGap(metric),
          }))}
        />
      </ChartCard>
    </div>
  )
}
