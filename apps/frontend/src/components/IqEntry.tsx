import { ChartIcon } from './Icons.tsx'
import './IqEntry.css'

export function IqEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="iq-entry">
      <span className="iq-entry__icon">
        <ChartIcon width={26} height={26} />
      </span>
      <div className="iq-entry__text">
        <h2>Tus números, en gráficas</h2>
        <p>
          Ventas, platos y clientes en un solo lugar, y cómo vas frente a
          comercios similares. Si aún no tienes el plan, verás un ejemplo.
        </p>
      </div>
      <button
        type="button"
        className="button button--primary iq-entry__action"
        onClick={onOpen}
      >
        Abrir PagoDirecto IQ
      </button>
    </section>
  )
}
