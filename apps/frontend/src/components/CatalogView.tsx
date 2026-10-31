import { useState } from 'react'
import { countItems, parsePrice, type EditableMenu } from '../lib/menu.ts'
import { formatMoney } from '../lib/orders.ts'
import './CatalogView.css'

// Así "pabellon" encuentra "Pabellón".
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

interface CatalogViewProps {
  // null si el comercio aún no publica un menú.
  menu: EditableMenu | null
  onEdit: () => void
}

export function CatalogView({ menu, onEdit }: CatalogViewProps) {
  const [query, setQuery] = useState('')

  if (!menu) {
    return (
      <section className="card catalog catalog--empty">
        <h2>Tu catálogo está vacío</h2>
        <p>Cuando publiques tu menú, aquí verás todos tus platos.</p>
        <button type="button" className="button button--primary" onClick={onEdit}>
          Crear mi menú
        </button>
      </section>
    )
  }

  const { total } = countItems(menu)
  const soldOut = menu.categories
    .flatMap((category) => category.items)
    .filter((item) => !item.available).length
  const search = normalize(query.trim())
  const categories = menu.categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) =>
        normalize(`${item.name} ${item.description}`).includes(search),
      ),
    }))
    .filter((category) => category.items.length > 0)

  return (
    <section className="card catalog">
      <div className="catalog__head">
        <div>
          <h2>Catálogo</h2>
          <p>Los platos que tus clientes pueden pedir por WhatsApp.</p>
        </div>
        <button type="button" className="text-button" onClick={onEdit}>
          Editar menú
        </button>
      </div>

      <ul className="stats">
        <li>
          <strong>{total}</strong> {total === 1 ? 'plato' : 'platos'}
        </li>
        <li>
          <strong>{total - soldOut}</strong> disponibles
        </li>
        {soldOut > 0 && (
          <li className="stats__warn">
            <strong>{soldOut}</strong> agotados
          </li>
        )}
      </ul>

      <input
        className="catalog__search"
        type="search"
        placeholder="Buscar un plato"
        aria-label="Buscar un plato"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {categories.length === 0 && (
        <p className="catalog__none">Ningún plato coincide con tu búsqueda.</p>
      )}

      {categories.map((category) => (
        <div key={category.id} className="catalog__category">
          <h3>{category.name}</h3>
          <ul className="catalog__items">
            {category.items.map((item) => (
              <li key={item.id} className="catalog__item">
                <span className="catalog__info">
                  <span className="catalog__name">{item.name}</span>
                  {item.description && (
                    <span className="catalog__description">
                      {item.description}
                    </span>
                  )}
                </span>
                <span className="catalog__side">
                  <strong>
                    {formatMoney(parsePrice(item.price) ?? 0, menu.currency)}
                  </strong>
                  <span
                    className={`catalog__state ${item.available ? '' : 'catalog__state--out'}`}
                  >
                    {item.available ? 'Disponible' : 'Agotado'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
