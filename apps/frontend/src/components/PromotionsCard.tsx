import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/api.ts'
import {
  MAX_PROMOTION_NAME,
  createPromotion,
  deletePromotion,
  describePromotion,
  toPromotionInput,
  updatePromotion,
  validatePromotion,
  type Promotion,
  type PromotionDraft,
  type PromotionErrors,
} from '../lib/loyalty.ts'
import { CURRENCY_SYMBOL, type Currency } from '../lib/menu.ts'
import { CheckIcon, TrashIcon } from './Icons.tsx'
import { LoadState } from './LoadState.tsx'

const EMPTY_DRAFT: PromotionDraft = {
  name: '',
  percent: '',
  minPurchases: '',
  minTotal: '',
}

interface PromotionsCardProps {
  token: string
  currency: Currency
  initialPromotions: Promotion[]
}

export function PromotionsCard({
  token,
  currency,
  initialPromotions,
}: PromotionsCardProps) {
  const [promotions, setPromotions] = useState(initialPromotions)
  const active = promotions.filter((promotion) => promotion.active).length

  return (
    <section className="card loyalty-promotions">
      <div className="loyalty__head">
        <div>
          <h2>Promociones</h2>
          <p>Descuentos sobre el pedido para premiar a tus clientes.</p>
        </div>
      </div>

      <ul className="loyalty__rules">
        <li>
          Se aplica <strong>una sola promoción por pedido</strong>: la mejor
          para el cliente.
        </li>
        <li>Las compras mínimas cuentan solo los pedidos ya pagados.</li>
      </ul>

      {promotions.length === 0 ? (
        <LoadState message="Todavía no tienes promociones. Crea la primera aquí abajo." />
      ) : (
        <>
          <ul className="stats">
            <li>
              <strong>{active}</strong> {active === 1 ? 'activa' : 'activas'}
            </li>
            {promotions.length > active && (
              <li>
                <strong>{promotions.length - active}</strong>{' '}
                {promotions.length - active === 1 ? 'apagada' : 'apagadas'}
              </li>
            )}
          </ul>

          <ul className="loyalty-promotions__list">
            {promotions.map((promotion) => (
              <PromotionRow
                key={promotion.id}
                token={token}
                currency={currency}
                promotion={promotion}
                onUpdated={(updated) =>
                  setPromotions((current) =>
                    current.map((p) => (p.id === updated.id ? updated : p)),
                  )
                }
                onDeleted={() =>
                  setPromotions((current) =>
                    current.filter((p) => p.id !== promotion.id),
                  )
                }
              />
            ))}
          </ul>
        </>
      )}

      <PromotionForm
        token={token}
        currency={currency}
        onCreated={(created) =>
          setPromotions((current) => [created, ...current])
        }
      />
    </section>
  )
}

interface PromotionRowProps {
  token: string
  currency: Currency
  promotion: Promotion
  onUpdated: (promotion: Promotion) => void
  onDeleted: () => void
}

function PromotionRow({
  token,
  currency,
  promotion,
  onUpdated,
  onDeleted,
}: PromotionRowProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { id, name, active } = promotion

  // Los controles no se deshabilitan al guardar: un control deshabilitado
  // pierde el foco y quien usa el teclado tendría que volver a buscarlo.
  async function toggle(next: boolean) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      onUpdated(await updatePromotion(token, id, { active: next }))
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (saving || !window.confirm(`¿Eliminar la promoción "${name}"?`)) return
    setSaving(true)
    setError(null)
    try {
      await deletePromotion(token, id)
      onDeleted()
    } catch (failure) {
      setError(errorMessage(failure))
      setSaving(false)
    }
  }

  return (
    <li
      className={`promotion ${active ? '' : 'promotion--off'}`}
      aria-busy={saving}
    >
      <span className="promotion__info">
        <span className="promotion__name">{name}</span>
        <span className="promotion__terms">
          {describePromotion(promotion, currency)}
        </span>
      </span>
      <span className="promotion__actions">
        <label className="switch">
          <input
            type="checkbox"
            checked={active}
            aria-label={`Promoción ${name} activa`}
            onChange={(event) => toggle(event.target.checked)}
          />
          <span className="switch__track" />
          <span>{active ? 'Activa' : 'Apagada'}</span>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label={`Eliminar la promoción ${name}`}
          title="Eliminar"
          onClick={remove}
        >
          <TrashIcon width={18} height={18} />
        </button>
      </span>
      {error && (
        <p className="field-error promotion__error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

interface PromotionFormProps {
  token: string
  currency: Currency
  onCreated: (promotion: Promotion) => void
}

function PromotionForm({ token, currency, onCreated }: PromotionFormProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [errors, setErrors] = useState<PromotionErrors>({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState(false)
  // Se arma con las condiciones: el nombre no cambia lo que recibe el cliente.
  const { percent, minPurchases, minTotal } = validatePromotion(draft)
  const preview =
    !percent && !minPurchases && !minTotal
      ? describePromotion(toPromotionInput(draft), currency)
      : null

  function edit(field: keyof PromotionDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setJustCreated(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validatePromotion(draft)
    setErrors(nextErrors)
    setJustCreated(false)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    setServerError(null)
    try {
      onCreated(await createPromotion(token, toPromotionInput(draft)))
      setDraft(EMPTY_DRAFT)
      setJustCreated(true)
    } catch (failure) {
      setServerError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="promotion-form" noValidate onSubmit={handleSubmit}>
      <h3>Crear una promoción</h3>

      <Field
        id="promotion-name"
        label="Nombre"
        placeholder="Clientes frecuentes"
        maxLength={MAX_PROMOTION_NAME}
        value={draft.name}
        error={errors.name}
        onChange={(value) => edit('name', value)}
      />

      <div className="promotion-form__numbers">
        <Field
          id="promotion-percent"
          label="Descuento (%)"
          placeholder="10"
          inputMode="decimal"
          value={draft.percent}
          error={errors.percent}
          onChange={(value) => edit('percent', value)}
        />
        <Field
          id="promotion-purchases"
          label="Compras mínimas"
          hint="Vacío: para todos."
          placeholder="3"
          inputMode="numeric"
          value={draft.minPurchases}
          error={errors.minPurchases}
          onChange={(value) => edit('minPurchases', value)}
        />
        <Field
          id="promotion-total"
          label={`Pedido mínimo (${CURRENCY_SYMBOL[currency]})`}
          hint="Vacío: cualquier monto."
          placeholder="20"
          inputMode="decimal"
          value={draft.minTotal}
          error={errors.minTotal}
          onChange={(value) => edit('minTotal', value)}
        />
      </div>

      {preview && (
        <p className="promotion-form__preview">
          <span>Quedaría así:</span> {preview}
        </p>
      )}

      <div className="promotion-form__actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={saving}
        >
          {saving ? 'Creando…' : 'Crear promoción'}
        </button>
        {serverError && (
          <p className="field-error" role="alert">
            {serverError}
          </p>
        )}
        {justCreated && (
          <p className="loyalty__saved" role="status">
            <CheckIcon width={14} height={14} /> Promoción creada y activa.
          </p>
        )}
      </div>
    </form>
  )
}

interface FieldProps {
  id: string
  label: string
  hint?: string
  placeholder: string
  inputMode?: 'decimal' | 'numeric'
  maxLength?: number
  value: string
  error?: string
  onChange: (value: string) => void
}

function Field({
  id,
  label,
  hint,
  placeholder,
  inputMode,
  maxLength,
  value,
  error,
  onChange,
}: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="loyalty__input"
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="field__hint">
            {hint}
          </span>
        )
      )}
    </div>
  )
}
