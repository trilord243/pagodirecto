import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { MenuItemInput, PublishedMenu } from './restaurant.schemas.js';

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  available: boolean;
}

export interface MenuCategory {
  name: string;
  items: Omit<MenuItem, 'category'>[];
}

export const DEFAULT_CATEGORY = 'Menú';
const DEFAULT_STAMPS = 5;

const ITEM_COLUMNS =
  'id, name, description, category, price::float8 as price, available';
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === UNIQUE_VIOLATION;
}

export function groupByCategory<Item extends { category: string | null }>(
  items: Item[],
) {
  const categories = new Map<string, Omit<Item, 'category'>[]>();
  for (const { category, ...item } of items) {
    const name = category || DEFAULT_CATEGORY;
    categories.set(name, [...(categories.get(name) ?? []), item]);
  }
  return [...categories].map(([name, grouped]) => ({ name, items: grouped }));
}

@Injectable()
export class MenuService {
  constructor(private readonly db: DatabaseService) {}

  async list(restaurantId: number): Promise<MenuItem[]> {
    const { rows } = await this.db.query<MenuItem>(
      `select ${ITEM_COLUMNS} from menu_items
        where restaurant_id = $1
        order by category nulls last, name`,
      [restaurantId],
    );
    return rows;
  }

  async get(restaurantId: number) {
    const { rows } = await this.db.query<{ currency: string }>(
      'select currency from restaurants where id = $1',
      [restaurantId],
    );
    return {
      currency: rows[0].currency,
      categories: groupByCategory(await this.list(restaurantId)),
    };
  }

  // El portal publica el menu completo: lo que se quito en el editor desaparece.
  // Los pedidos ya hechos guardan su propia copia de nombre y precio.
  async publish(restaurantId: number, menu: PublishedMenu) {
    await this.db.transaction(async (tx) => {
      await tx.query('update restaurants set currency = $2 where id = $1', [
        restaurantId,
        menu.currency,
      ]);
      const names: string[] = [];
      for (const category of menu.categories) {
        for (const item of category.items) {
          names.push(item.name);
          await tx.query(
            `insert into menu_items
               (restaurant_id, name, description, category, price, available)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (restaurant_id, lower(name)) do update
               set name = excluded.name,
                   description = excluded.description,
                   category = excluded.category,
                   price = excluded.price,
                   available = excluded.available,
                   updated_at = now()`,
            [
              restaurantId,
              item.name,
              item.description ?? null,
              category.name,
              item.price,
              item.available,
            ],
          );
        }
      }
      await tx.query(
        `delete from menu_items
          where restaurant_id = $1
            and lower(name) <> all (select lower(unnest($2::text[])))`,
        [restaurantId, names],
      );
      // Todo comercio arranca con tarjeta: su plato mas barato tras 5 compras.
      // Si ya tiene una, aunque la haya apagado, se respeta.
      await tx.query(
        `insert into loyalty_programs
           (restaurant_id, stamps_required, reward_item_id)
         select restaurant_id, $2, id from menu_items
          where restaurant_id = $1 and available
          order by price, id
          limit 1
         on conflict (restaurant_id) do nothing`,
        [restaurantId, DEFAULT_STAMPS],
      );
    });
    return this.get(restaurantId);
  }

  async create(restaurantId: number, item: MenuItemInput): Promise<MenuItem> {
    try {
      const { rows } = await this.db.query<MenuItem>(
        `insert into menu_items (restaurant_id, name, description, category, price)
         values ($1, $2, $3, $4, $5)
         returning ${ITEM_COLUMNS}`,
        [
          restaurantId,
          item.name,
          item.description ?? null,
          item.category ?? null,
          item.price,
        ],
      );
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un plato con ese nombre');
      }
      throw error;
    }
  }

  async update(
    restaurantId: number,
    itemId: number,
    patch: Partial<MenuItemInput> & { available?: boolean },
  ): Promise<MenuItem> {
    // Las claves ya pasaron por el esquema: no llega ninguna columna ajena.
    const entries = Object.entries(patch);
    const assignments = entries.map(([column], i) => `${column} = $${i + 3}`);
    try {
      const { rows } = await this.db.query<MenuItem>(
        `update menu_items
            set ${assignments.join(', ')}, updated_at = now()
          where restaurant_id = $1 and id = $2
          returning ${ITEM_COLUMNS}`,
        [restaurantId, itemId, ...entries.map(([, value]) => value)],
      );
      if (!rows[0]) {
        throw new NotFoundException('Plato no encontrado');
      }
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un plato con ese nombre');
      }
      throw error;
    }
  }

  async remove(restaurantId: number, itemId: number): Promise<void> {
    const { rows } = await this.db.query(
      'delete from menu_items where restaurant_id = $1 and id = $2 returning id',
      [restaurantId, itemId],
    );
    if (!rows[0]) {
      throw new NotFoundException('Plato no encontrado');
    }
  }
}
