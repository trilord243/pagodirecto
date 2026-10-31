import { apiRequest } from './api.ts'

export type Currency = 'USD' | 'VES'

export interface MenuItem {
  id: string
  name: string
  description: string
  // Texto tal como lo escribe el comercio ("4,50"); se valida al publicar.
  price: string
  available: boolean
  // Motivo por el que el escaneo no está seguro de este producto.
  reviewReason: string | null
}

export interface MenuCategory {
  id: string
  name: string
  items: MenuItem[]
}

export interface EditableMenu {
  currency: Currency
  categories: MenuCategory[]
}

export interface MenuErrors {
  [fieldKey: string]: string
}

// Lo que devuelve la API. Solo el escaneo trae precios sin leer y reviewReason.
export interface ApiMenu {
  currency: Currency
  categories: {
    name: string
    items: {
      name: string
      description: string | null
      price: number | null
      available: boolean
      reviewReason?: string | null
    }[]
  }[]
}

// Un plato como lo guarda el servidor: solo aquí viene su id real.
export interface StoredMenuItem {
  id: number
  name: string
  description: string | null
  category: string | null
  price: number
  available: boolean
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  VES: 'Bs',
}

const newId = () => crypto.randomUUID()

export function createItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: newId(),
    name: '',
    description: '',
    price: '',
    available: true,
    reviewReason: null,
    ...overrides,
  }
}

export function createCategory(
  name = '',
  items: MenuItem[] = [createItem()],
): MenuCategory {
  return { id: newId(), name, items }
}

export function parsePrice(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  return value > 0 ? value : null
}

const formatPrice = (price: number) => price.toFixed(2).replace('.', ',')

export function toEditableMenu({ currency, categories }: ApiMenu): EditableMenu {
  return {
    currency,
    categories: categories.map((category) =>
      createCategory(
        category.name,
        category.items.map((item) =>
          createItem({
            name: item.name,
            description: item.description ?? '',
            price: item.price === null ? '' : formatPrice(item.price),
            available: item.available,
            reviewReason: item.reviewReason ?? null,
          }),
        ),
      ),
    ),
  }
}

// Se llama después de validateMenu: todos los precios ya son válidos.
function toPublishBody({ currency, categories }: EditableMenu) {
  return {
    currency,
    categories: categories.map((category) => ({
      name: category.name.trim(),
      items: category.items.map((item) => ({
        name: item.name.trim(),
        description: item.description.trim() || undefined,
        price: parsePrice(item.price),
        available: item.available,
      })),
    })),
  }
}

export async function fetchMenu(
  token: string,
  signal: AbortSignal,
): Promise<EditableMenu> {
  return toEditableMenu(
    await apiRequest<ApiMenu>('/restaurants/menu', { token, signal }),
  )
}

export const fetchMenuItems = (token: string, signal: AbortSignal) =>
  apiRequest<StoredMenuItem[]>('/restaurants/menu/items', { token, signal })

// Reemplaza el menú completo: lo que no venga aquí se borra en el servidor.
export async function publishMenu(
  token: string,
  menu: EditableMenu,
): Promise<EditableMenu> {
  return toEditableMenu(
    await apiRequest<ApiMenu>('/restaurants/menu', {
      method: 'PUT',
      token,
      body: toPublishBody(menu),
    }),
  )
}

export const fieldKey = (itemId: string, field: 'name' | 'price') =>
  `${itemId}:${field}`

export function validateMenu(menu: EditableMenu): MenuErrors {
  const errors: MenuErrors = {}
  for (const category of menu.categories) {
    if (!category.name.trim()) {
      errors[category.id] = 'Ponle nombre a la categoría.'
    } else if (category.items.length === 0) {
      errors[category.id] = 'Agrega un producto o elimina la categoría.'
    }
    for (const item of category.items) {
      if (!item.name.trim()) {
        errors[fieldKey(item.id, 'name')] = 'Falta el nombre.'
      }
      if (parsePrice(item.price) === null) {
        errors[fieldKey(item.id, 'price')] = 'Precio inválido.'
      }
    }
  }
  return errors
}

export function countItems(menu: EditableMenu) {
  const items = menu.categories.flatMap((category) => category.items)
  return {
    total: items.length,
    toReview: items.filter((item) => item.reviewReason).length,
  }
}
