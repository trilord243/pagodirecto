import { useState } from 'react'
import { errorMessage } from '../lib/api.ts'
import {
  CURRENCY_SYMBOL,
  countItems,
  createCategory,
  createItem,
  fieldKey,
  validateMenu,
  type Currency,
  type EditableMenu,
  type MenuCategory,
  type MenuErrors,
  type MenuItem,
} from '../lib/menu.ts'
import { AlertIcon, CheckIcon, PlusIcon, TrashIcon } from './Icons.tsx'
import './MenuEditor.css'

// Los mismos límites que aplica el backend al publicar.
const MAX_CATEGORY_NAME = 80
const MAX_ITEM_NAME = 120
const MAX_DESCRIPTION = 500

interface MenuEditorProps {
  accountName: string
  initialMenu: EditableMenu
  published: boolean
  // Hay archivos subidos con los que comparar lo que se leyó.
  hasOriginal: boolean
  // Publicar este menú borra el que ya está activo en WhatsApp.
  replacesPublished: boolean
  cancelLabel: string
  onCancel: () => void
  onPublish: (menu: EditableMenu) => Promise<EditableMenu>
}

export function MenuEditor({
  accountName,
  initialMenu,
  published,
  hasOriginal,
  replacesPublished,
  cancelLabel,
  onCancel,
  onPublish,
}: MenuEditorProps) {
  const [menu, setMenu] = useState(initialMenu)
  const [errors, setErrors] = useState<MenuErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Cualquier edición crea otro objeto, y con eso se apaga el "guardado".
  const [savedMenu, setSavedMenu] = useState<EditableMenu | null>(null)
  const { total, toReview } = countItems(menu)
  const manual = !published && !hasOriginal

  const defaultNotice =
    menu === savedMenu
      ? 'Cambios guardados.'
      : published
        ? 'Tu menú ya está publicado. Los cambios se aplicarán al guardar.'
        : replacesPublished
          ? 'Al publicar, este menú reemplaza al que tienes activo.'
          : ''

  function clearError(key: string) {
    if (!(key in errors)) return
    setErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function updateCategory(categoryId: string, patch: Partial<MenuCategory>) {
    setMenu((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === categoryId ? { ...category, ...patch } : category,
      ),
    }))
  }

  function updateItem(
    categoryId: string,
    itemId: string,
    patch: Partial<MenuItem>,
  ) {
    setMenu((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              items: category.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : category,
      ),
    }))
  }

  function removeCategory(category: MenuCategory) {
    const hasContent = category.items.some((item) => item.name.trim())
    if (
      hasContent &&
      !window.confirm(`¿Eliminar "${category.name || 'esta categoría'}" y sus productos?`)
    ) {
      return
    }
    setMenu((current) => ({
      ...current,
      categories: current.categories.filter((c) => c.id !== category.id),
    }))
  }

  async function handlePublish() {
    const nextErrors = validateMenu(menu)
    setErrors(nextErrors)
    const errorCount = Object.keys(nextErrors).length

    if (menu.categories.length === 0 || total === 0) {
      setNotice('Tu menú necesita al menos un producto.')
    } else if (errorCount > 0) {
      setNotice(
        `Hay ${errorCount} ${errorCount === 1 ? 'dato' : 'datos'} por completar.`,
      )
    } else if (toReview > 0) {
      setNotice(
        `Confirma ${toReview === 1 ? 'el producto marcado' : `los ${toReview} productos marcados`} para revisión.`,
      )
    } else {
      setNotice(null)
      setSaving(true)
      try {
        const saved = await onPublish(menu)
        setMenu(saved)
        setSavedMenu(saved)
      } catch (error) {
        setNotice(errorMessage(error))
      } finally {
        setSaving(false)
      }
      return
    }

    requestAnimationFrame(() => {
      document
        .querySelector('.item--error, .item--review, .category__name--error')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <div className="editor">
      <section className="card editor-summary">
        <div>
          <span className="editor-summary__eyebrow">{accountName}</span>
          <h2>
            {published
              ? 'Tu menú publicado'
              : manual
                ? 'Crea tu menú'
                : 'Revisa tu menú'}
          </h2>
          <p>
            {published
              ? 'Esto es lo que tus clientes ven en WhatsApp. Cambia nombres, precios o disponibilidad cuando quieras.'
              : manual
                ? 'Agrega una categoría, por ejemplo Bebidas, y sus productos con el precio de cada uno.'
                : 'Esto es lo que leímos de tu menú. Así lo verán tus clientes en WhatsApp: corrige nombres, precios o disponibilidad antes de publicarlo.'}
          </p>
          {hasOriginal && (
            <button
              type="button"
              className="text-button editor-summary__original"
              onClick={() =>
                document
                  .querySelector('.original-card')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Ver menú original
            </button>
          )}
        </div>

        <div className="editor-summary__row">
          <ul className="stats">
            <li>
              <strong>{menu.categories.length}</strong> categorías
            </li>
            <li>
              <strong>{total}</strong> productos
            </li>
            <li className={toReview > 0 ? 'stats__warn' : 'stats__ok'}>
              {toReview > 0 ? (
                <>
                  <strong>{toReview}</strong> por revisar
                </>
              ) : (
                'Todo revisado'
              )}
            </li>
          </ul>

          <div className="currency">
            <span id="currency-label">Moneda</span>
            <div
              className="segmented"
              role="radiogroup"
              aria-labelledby="currency-label"
            >
              {(['USD', 'VES'] as Currency[]).map((currency) => (
                <button
                  key={currency}
                  type="button"
                  role="radio"
                  aria-checked={menu.currency === currency}
                  className="segmented__option"
                  onClick={() => setMenu({ ...menu, currency })}
                >
                  {currency === 'USD' ? 'Dólares ($)' : 'Bolívares (Bs)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {menu.categories.map((category) => (
        <section key={category.id} className="card category">
          <div className="category__head">
            <div className="category__title">
              <input
                className={`category__name ${errors[category.id] ? 'category__name--error' : ''}`}
                value={category.name}
                maxLength={MAX_CATEGORY_NAME}
                placeholder="Nombre de la categoría"
                aria-label="Nombre de la categoría"
                onChange={(event) => {
                  updateCategory(category.id, { name: event.target.value })
                  clearError(category.id)
                }}
              />
              {errors[category.id] && (
                <p className="field-error">{errors[category.id]}</p>
              )}
            </div>
            <span className="category__count">
              {category.items.length}{' '}
              {category.items.length === 1 ? 'producto' : 'productos'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Eliminar categoría ${category.name}`}
              onClick={() => removeCategory(category)}
            >
              <TrashIcon width={18} height={18} />
            </button>
          </div>

          <ul className="items">
            {category.items.map((item) => (
              <ItemEditor
                key={item.id}
                item={item}
                currency={menu.currency}
                errors={errors}
                onChange={(patch) => {
                  updateItem(category.id, item.id, patch)
                  if ('name' in patch) clearError(fieldKey(item.id, 'name'))
                  if ('price' in patch) clearError(fieldKey(item.id, 'price'))
                }}
                onRemove={() =>
                  updateCategory(category.id, {
                    items: category.items.filter((i) => i.id !== item.id),
                  })
                }
              />
            ))}
          </ul>

          <button
            type="button"
            className="add-button"
            onClick={() => {
              updateCategory(category.id, {
                items: [...category.items, createItem()],
              })
              clearError(category.id)
            }}
          >
            <PlusIcon width={18} height={18} /> Agregar producto
          </button>
        </section>
      ))}

      <button
        type="button"
        className="add-button add-button--category"
        onClick={() =>
          setMenu({
            ...menu,
            categories: [...menu.categories, createCategory()],
          })
        }
      >
        <PlusIcon width={20} height={20} /> Agregar categoría
      </button>

      <div className="editor-bar">
        <p className="editor-bar__notice" role="status">
          {notice ?? defaultNotice}
        </p>
        <div className="editor-bar__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            disabled={saving}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={handlePublish}
            disabled={saving}
          >
            {saving
              ? published
                ? 'Guardando…'
                : 'Publicando…'
              : published
                ? 'Guardar cambios'
                : 'Publicar en WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ItemEditorProps {
  item: MenuItem
  currency: Currency
  errors: MenuErrors
  onChange: (patch: Partial<MenuItem>) => void
  onRemove: () => void
}

function ItemEditor({ item, currency, errors, onChange, onRemove }: ItemEditorProps) {
  const nameError = errors[fieldKey(item.id, 'name')]
  const priceError = errors[fieldKey(item.id, 'price')]
  const classes = [
    'item',
    item.reviewReason && 'item--review',
    (nameError || priceError) && 'item--error',
    !item.available && 'item--unavailable',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={classes}>
      {item.reviewReason && (
        <div className="item__review">
          <AlertIcon width={18} height={18} />
          <span>{item.reviewReason}</span>
          <button
            type="button"
            className="item__confirm"
            onClick={() => onChange({ reviewReason: null })}
          >
            <CheckIcon width={14} height={14} /> Está bien
          </button>
        </div>
      )}

      <div className="item__main">
        <label className="item__field">
          <span className="item__label">Producto</span>
          <input
            value={item.name}
            maxLength={MAX_ITEM_NAME}
            placeholder="Nombre del producto"
            aria-invalid={Boolean(nameError)}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          {nameError && <span className="field-error">{nameError}</span>}
        </label>

        <label className="item__field item__field--price">
          <span className="item__label">Precio</span>
          <span className="price-input">
            <span className="price-input__symbol">{CURRENCY_SYMBOL[currency]}</span>
            <input
              value={item.price}
              inputMode="decimal"
              placeholder="0,00"
              aria-invalid={Boolean(priceError)}
              onChange={(event) => onChange({ price: event.target.value })}
            />
          </span>
          {priceError && <span className="field-error">{priceError}</span>}
        </label>
      </div>

      <label className="item__field">
        <span className="item__label">Descripción (opcional)</span>
        <textarea
          rows={2}
          value={item.description}
          maxLength={MAX_DESCRIPTION}
          placeholder="Ingredientes, tamaño o detalles para tus clientes"
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>

      <div className="item__footer">
        <label className="switch">
          <input
            type="checkbox"
            checked={item.available}
            onChange={(event) => onChange({ available: event.target.checked })}
          />
          <span className="switch__track" aria-hidden="true" />
          {item.available ? 'Disponible' : 'Agotado'}
        </label>
        <button
          type="button"
          className="text-button text-button--danger"
          onClick={onRemove}
        >
          <TrashIcon width={16} height={16} /> Eliminar
        </button>
      </div>
    </li>
  )
}
