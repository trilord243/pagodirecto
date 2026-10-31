import { useEffect, useState } from 'react'
import { errorMessage } from '../lib/api.ts'
import {
  MAX_STAMPS,
  MIN_STAMPS,
  fetchLoyalty,
  fetchPromotions,
  saveLoyalty,
  type LoyaltyCustomer,
  type LoyaltyOverview,
  type LoyaltyProgram,
  type Promotion,
} from '../lib/loyalty.ts'
import {
  fetchMenuItems,
  type Currency,
  type StoredMenuItem,
} from '../lib/menu.ts'
import { AlertIcon, CheckIcon } from './Icons.tsx'
import { LoadState } from './LoadState.tsx'
import { LoyaltyCardPreview, LoyaltyProgress } from './LoyaltyCard.tsx'
import { PromotionsCard } from './PromotionsCard.tsx'
import './LoyaltyView.css'

const DEFAULT_STAMPS = 5
const DEFAULT_CATEGORY = 'Menú'
const DEFAULT_CUSTOMER_NAME = 'Cliente de WhatsApp'

// Un cliente de ejemplo a medio camino, para que se vean ojitos llenos y vacíos.
const sampleStamps = (stampsRequired: number) =>
  Math.min(stampsRequired - 1, Math.ceil(stampsRequired * 0.6))

// Sin premio el backend no le manda la tarjeta a nadie, aunque esté encendida.
function previewCaption(active: boolean, hasReward: boolean, stamps: number) {
  if (!active) return 'Mientras esté apagada, tus clientes no la verán.'
  if (!hasReward) return 'Así se verá con un premio. Sin él, tus clientes no la reciben.'
  return `Así la ve un cliente con ${stamps} ${stamps === 1 ? 'compra' : 'compras'}. Se la mandamos por WhatsApp cada vez que suma una.`
}

function groupByCategory(items: StoredMenuItem[]) {
  const groups = new Map<string, StoredMenuItem[]>()
  for (const item of items) {
    const category = item.category || DEFAULT_CATEGORY
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return [...groups]
}

function programStatus(program: LoyaltyProgram | null) {
  if (!program) return { label: 'Sin crear', className: '' }
  if (!program.rewardName) return { label: 'Sin premio', className: 'loyalty-chip--warn' }
  return program.active
    ? { label: 'Activa', className: 'loyalty-chip--ok' }
    : { label: 'Apagada', className: '' }
}

interface LoyaltyData {
  overview: LoyaltyOverview
  items: StoredMenuItem[]
  promotions: Promotion[]
}

interface LoyaltyViewProps {
  token: string
  businessName: string
  currency: Currency
  onEditMenu: () => void
}

export function LoyaltyView({
  token,
  businessName,
  currency,
  onEditMenu,
}: LoyaltyViewProps) {
  const [data, setData] = useState<LoyaltyData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      fetchLoyalty(token, signal),
      fetchMenuItems(token, signal),
      fetchPromotions(token, signal),
    ]).then(
      ([overview, items, promotions]) =>
        setData({ overview, items, promotions }),
      (error) => {
        if (signal.aborted) return
        setLoadError(errorMessage(error))
      },
    )
    return () => controller.abort()
  }, [token, attempt])

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

  if (!data) {
    return (
      <section className="card">
        <LoadState message="Cargando tu tarjeta y tus promociones…" />
      </section>
    )
  }

  const { overview, items, promotions } = data

  return (
    <div className="loyalty">
      <CardSetup
        token={token}
        businessName={businessName}
        program={overview.program}
        items={items}
        onSaved={(next) =>
          setData((current) => current && { ...current, overview: next })
        }
        onEditMenu={onEditMenu}
      />
      <PromotionsCard
        token={token}
        currency={currency}
        initialPromotions={promotions}
      />
      <CustomersCard
        customers={overview.customers}
        program={overview.program}
      />
    </div>
  )
}

interface CardSetupProps {
  token: string
  businessName: string
  program: LoyaltyProgram | null
  items: StoredMenuItem[]
  onSaved: (overview: LoyaltyOverview) => void
  onEditMenu: () => void
}

function CardSetup({
  token,
  businessName,
  program,
  items,
  onSaved,
  onEditMenu,
}: CardSetupProps) {
  const [stampsRequired, setStampsRequired] = useState(
    program?.stampsRequired ?? DEFAULT_STAMPS,
  )
  const [rewardItemId, setRewardItemId] = useState(
    program?.rewardItemId ?? null,
  )
  const [active, setActive] = useState(program?.active ?? true)
  const [rewardError, setRewardError] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const hasMenu = items.length > 0
  const reward = items.find((item) => item.id === rewardItemId) ?? null
  const status = programStatus(program)
  const unsaved =
    !program ||
    program.stampsRequired !== stampsRequired ||
    program.rewardItemId !== rewardItemId ||
    program.active !== active
  const stamps = sampleStamps(stampsRequired)

  async function handleSave() {
    if (rewardItemId === null) {
      setRewardError(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      onSaved(await saveLoyalty(token, { stampsRequired, rewardItemId, active }))
      setJustSaved(true)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card loyalty-setup">
      <div className="loyalty__head">
        <div>
          <h2>Tarjeta de fidelidad</h2>
          <p>Tus clientes suman ojitos con cada compra y ganan un plato gratis.</p>
        </div>
        <ul className="stats">
          <li className={status.className}>{status.label}</li>
        </ul>
      </div>

      {hasMenu && program && !program.rewardName && (
        <div className="loyalty__alert" role="alert">
          <AlertIcon width={20} height={20} />
          <p>
            <strong>Tu tarjeta se quedó sin premio.</strong> El plato que
            escogiste ya no está en tu menú. Escoge otro: mientras tanto, las
            compras no suman ojitos y tus clientes no pueden canjear lo que ya
            ganaron.
          </p>
        </div>
      )}

      <div className="loyalty-setup__grid">
        {hasMenu ? (
          <div className="loyalty-setup__form">
            <label className="field">
              <span className="field__label">Compras para ganar el premio</span>
              <span className="loyalty-setup__range">
                <input
                  type="range"
                  min={MIN_STAMPS}
                  max={MAX_STAMPS}
                  value={stampsRequired}
                  aria-valuetext={`${stampsRequired} compras`}
                  onChange={(event) =>
                    setStampsRequired(Number(event.target.value))
                  }
                />
                <output>{stampsRequired}</output>
              </span>
            </label>

            <label className={`field ${rewardError ? 'field--error' : ''}`}>
              <span className="field__label">Plato de premio</span>
              <select
                className="loyalty__input"
                value={rewardItemId ?? ''}
                aria-invalid={rewardError}
                onChange={(event) => {
                  setRewardItemId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                  setRewardError(false)
                }}
              >
                <option value="">Escoge un plato</option>
                {groupByCategory(items).map(([category, dishes]) => (
                  <optgroup key={category} label={category}>
                    {dishes.map((dish) => (
                      <option key={dish.id} value={dish.id}>
                        {dish.name}
                        {dish.available ? '' : ' (agotado)'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {rewardError && (
                <span className="field-error" role="alert">
                  Escoge el plato que le regalarás al cliente.
                </span>
              )}
              {reward && !reward.available && (
                <span className="field__hint">
                  Este plato está agotado: mientras siga así, tus clientes no
                  podrán canjear el premio.
                </span>
              )}
            </label>

            <label className="switch">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              <span className="switch__track" />
              {active ? 'Tarjeta activa' : 'Tarjeta apagada'}
            </label>

            <ul className="loyalty__rules">
              <li>
                Una compra cuenta en la tarjeta cuando{' '}
                <strong>marcas el pedido como pagado</strong>, no cuando el
                cliente lo hace.
              </li>
              {!active && (
                <li>
                  Apagada, las compras no suman ojitos y tus clientes no pueden
                  canjear premios. Lo que ya llevan no se pierde.
                </li>
              )}
            </ul>

            <div className="loyalty-setup__actions">
              <button
                type="button"
                className="button button--primary"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Guardando…' : 'Guardar tarjeta'}
              </button>
              {saveError && (
                <p className="field-error" role="alert">
                  {saveError}
                </p>
              )}
              {!saveError && justSaved && !unsaved && (
                <p className="loyalty__saved" role="status">
                  <CheckIcon width={14} height={14} /> Tarjeta guardada.
                </p>
              )}
              {!saveError && program && unsaved && (
                <p className="field__hint">Tienes cambios sin guardar.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="loyalty-setup__empty">
            <p>
              Para crear tu tarjeta primero necesitas un menú: el premio es uno
              de tus platos.
            </p>
            <button
              type="button"
              className="button button--primary"
              onClick={onEditMenu}
            >
              Crear mi menú
            </button>
          </div>
        )}

        <figure
          className={`loyalty-setup__preview ${active ? '' : 'loyalty-setup__preview--off'}`}
        >
          <LoyaltyCardPreview
            businessName={businessName}
            stamps={stamps}
            stampsRequired={stampsRequired}
            rewardName={reward?.name ?? null}
          />
          <figcaption>{previewCaption(active, reward !== null, stamps)}</figcaption>
        </figure>
      </div>
    </section>
  )
}

interface CustomersCardProps {
  customers: LoyaltyCustomer[]
  program: LoyaltyProgram | null
}

function CustomersCard({ customers, program }: CustomersCardProps) {
  const rewards = customers.reduce(
    (sum, { rewardsAvailable }) => sum + rewardsAvailable,
    0,
  )

  return (
    <section className="card loyalty-customers">
      <div className="loyalty__head">
        <div>
          <h2>Clientes</h2>
          <p>Quienes ya tienen una compra pagada en tu comercio.</p>
        </div>
      </div>

      {customers.length === 0 ? (
        <LoadState message="Todavía no tienes clientes aquí. Aparecerán cuando marques su primer pedido como pagado." />
      ) : (
        <>
          <ul className="stats">
            <li>
              <strong>{customers.length}</strong>{' '}
              {customers.length === 1 ? 'cliente' : 'clientes'}
            </li>
            <li className={rewards > 0 ? 'loyalty-chip--warn' : ''}>
              <strong>{rewards}</strong>{' '}
              {rewards === 1 ? 'premio por canjear' : 'premios por canjear'}
            </li>
          </ul>

          <ul className="loyalty-customers__list">
            {customers.map((customer) => (
              <li key={customer.phone} className="customer">
                <span className="customer__who">
                  <span className="customer__name">
                    {customer.name || DEFAULT_CUSTOMER_NAME}
                  </span>
                  <span className="customer__phone">{customer.phone}</span>
                </span>
                {program && (
                  <LoyaltyProgress
                    stamps={customer.stamps}
                    stampsRequired={program.stampsRequired}
                  />
                )}
                <ul className="stats customer__facts">
                  <li>
                    <strong>{customer.purchases}</strong>{' '}
                    {customer.purchases === 1 ? 'compra' : 'compras'}
                  </li>
                  <li
                    className={customer.rewardsAvailable > 0 ? 'loyalty-chip--warn' : ''}
                  >
                    <strong>{customer.rewardsAvailable}</strong>{' '}
                    {customer.rewardsAvailable === 1 ? 'premio' : 'premios'}
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
