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

export interface ScannedMenu {
  currency: Currency
  categories: MenuCategory[]
}

export interface MenuErrors {
  [fieldKey: string]: string
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

export const fieldKey = (itemId: string, field: 'name' | 'price') =>
  `${itemId}:${field}`

export function validateMenu(menu: ScannedMenu): MenuErrors {
  const errors: MenuErrors = {}
  for (const category of menu.categories) {
    if (!category.name.trim()) {
      errors[category.id] = 'Ponle nombre a la categoría.'
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

export function countItems(menu: ScannedMenu) {
  const items = menu.categories.flatMap((category) => category.items)
  return {
    total: items.length,
    toReview: items.filter((item) => item.reviewReason).length,
  }
}

// TODO: reemplazar por la respuesta real del escaneo cuando exista el backend.
// Devuelve un menú de ejemplo con algunos productos marcados para revisión.
export async function scanMenu(): Promise<ScannedMenu> {
  await new Promise((resolve) => setTimeout(resolve, 2500))
  return {
    currency: 'USD',
    categories: [
      createCategory('Arepas', [
        createItem({
          name: 'Reina pepiada',
          description: 'Pollo desmechado, aguacate y mayonesa.',
          price: '4,50',
        }),
        createItem({
          name: 'Pabellón',
          description: 'Carne mechada, caraotas, tajadas y queso blanco.',
          price: '5,00',
        }),
        createItem({
          name: 'Dominó',
          description: 'Caraotas negras y queso blanco rallado.',
          price: '',
          reviewReason: 'No pudimos leer el precio.',
        }),
      ]),
      createCategory('Empanadas', [
        createItem({
          name: 'Carne molida',
          description: '',
          price: '2,00',
        }),
        createItem({
          name: 'Cazón',
          description: 'Disponible solo fines de semana.',
          price: '2,50',
          available: false,
        }),
        createItem({
          name: 'Queso de mano',
          description: '',
          price: '1,80',
          reviewReason: 'El nombre no se veía claro en la foto.',
        }),
      ]),
      createCategory('Bebidas', [
        createItem({ name: 'Papelón con limón', description: '', price: '1,50' }),
        createItem({
          name: 'Jugo natural',
          description: 'Parchita, mora o guayaba.',
          price: '2,00',
        }),
        createItem({ name: 'Malta', description: '', price: '1,20' }),
      ]),
    ],
  }
}
