import { useEffect, useState } from 'react'
import { errorMessage } from '../lib/api.ts'
import {
  ORDER_STATUS_LABEL,
  fetchOrders,
  formatMoney,
  formatOrderDate,
  updateOrder,
  type Order,
  type OrderPatch,
  type OrderStatus,
} from '../lib/orders.ts'
import { CheckIcon } from './Icons.tsx'
import { LoadState } from './LoadState.tsx'
import './OrdersView.css'

const STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]

type OrderFilter = OrderStatus | 'all'

interface OrdersViewProps {
  token: string
}

export function OrdersView({ token }: OrdersViewProps) {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [filter, setFilter] = useState<OrderFilter>('all')
  const shown = orders?.filter(
    (order) => filter === 'all' || order.status === filter,
  )

  useEffect(() => {
    const controller = new AbortController()
    fetchOrders(token, controller.signal).then(
      (next) => {
        setOrders(next)
        setLoading(false)
      },
      (error) => {
        if (controller.signal.aborted) return
        setLoadError(errorMessage(error))
        setLoading(false)
      },
    )
    return () => controller.abort()
  }, [token, attempt])

  function reload() {
    setLoadError(null)
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  return (
    <section className="card orders">
      <div className="orders__head">
        <div>
          <h2>Pedidos</h2>
          <p>
            Los que toma el agente de WhatsApp. Al marcar uno como pagado, suma
            una compra en la tarjeta del cliente.
          </p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={reload}
          disabled={loading}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {loadError && <LoadState message={loadError} onRetry={reload} />}
      {!orders && !loadError && <LoadState message="Cargando tus pedidos…" />}
      {orders?.length === 0 && !loadError && (
        <LoadState message="Todavía no tienes pedidos. Cuando un cliente pida por WhatsApp, aparecerá aquí." />
      )}

      {orders && orders.length > 0 && (
        <div className="orders__filters" role="group" aria-label="Filtrar pedidos">
          {(['all', ...STATUS_OPTIONS] as OrderFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              className="orders__filter"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === 'all' ? 'Todos' : ORDER_STATUS_LABEL[option]}{' '}
              <span>
                {option === 'all'
                  ? orders.length
                  : orders.filter(({ status }) => status === option).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {shown?.length === 0 && orders?.length !== 0 && (
        <LoadState message="No tienes pedidos en este estado." />
      )}

      {shown && shown.length > 0 && (
        <ul className="orders__list">
          {shown.map((order) => (
            <OrderCard
              key={order.id}
              token={token}
              order={order}
              onUpdated={(updated) =>
                setOrders((current) =>
                  current?.map((o) => (o.id === updated.id ? updated : o)) ??
                  null,
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}

interface OrderCardProps {
  token: string
  order: Order
  onUpdated: (order: Order) => void
}

function OrderCard({ token, order, onUpdated }: OrderCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: OrderPatch) {
    setSaving(true)
    setError(null)
    try {
      onUpdated(await updateOrder(token, order.id, patch))
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="order">
      <div className="order__head">
        <span>
          <span className="order__customer">
            #{order.id} · {order.customer_name}
          </span>
          <span className="order__meta">
            {order.customer_phone} · {formatOrderDate(order.created_at)}
          </span>
        </span>
        <strong className="order__total">
          {formatMoney(order.total, order.currency)}
        </strong>
      </div>

      <ul className="order__items">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>
              {item.quantity} × {item.name}
            </span>
            {item.unit_price === 0 ? (
              <span className="order__reward">Premio</span>
            ) : (
              <span>
                {formatMoney(item.quantity * item.unit_price, order.currency)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <dl className="order__summary">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(order.subtotal, order.currency)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="order__discount">
            <dt>
              Descuento
              {order.promotion_name && ` · ${order.promotion_name}`}
            </dt>
            <dd>− {formatMoney(order.discount, order.currency)}</dd>
          </div>
        )}
      </dl>

      {order.notes && <p className="order__notes">{order.notes}</p>}

      <div className="order__footer">
        <label className="order__status">
          <span>Estado</span>
          <select
            value={order.status}
            disabled={saving}
            onChange={(event) =>
              save({ status: event.target.value as OrderStatus })
            }
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        {order.payment_status === 'paid' ? (
          <span className="order__paid">
            <CheckIcon width={14} height={14} />{' '}
            {order.payment_method === 'wallet' ? 'Pagado con wallet' : 'Pagado'}
          </span>
        ) : (
          <button
            type="button"
            className="order__pay"
            disabled={saving}
            onClick={() => save({ paymentStatus: 'paid' })}
          >
            Marcar como pagado
          </button>
        )}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}
