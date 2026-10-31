import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.service.js';
import type { MenuItemInput } from './restaurant.schemas.js';

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  available: boolean;
}

const ITEM_COLUMNS =
  'id, name, description, category, price::float8 as price, available';
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === UNIQUE_VIOLATION;
}

function upsertItem(db: Queryable, restaurantId: number, item: MenuItemInput) {
  return db.query(
    `insert into menu_items (restaurant_id, name, description, category, price)
     values ($1, $2, $3, $4, $5)
     on conflict (restaurant_id, lower(name)) do update
       set description = excluded.description,
           category = excluded.category,
           price = excluded.price,
           available = true,
           updated_at = now()`,
    [
      restaurantId,
      item.name,
      item.description ?? null,
      item.category ?? null,
      item.price,
    ],
  );
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

  // Lo confirmado se suma al menu: un plato con el mismo nombre se actualiza y
  // lo que no venga en la foto se queda como esta.
  async confirm(
    restaurantId: number,
    items: MenuItemInput[],
    currency?: string,
  ): Promise<MenuItem[]> {
    await this.db.transaction(async (tx) => {
      if (currency) {
        await tx.query('update restaurants set currency = $2 where id = $1', [
          restaurantId,
          currency,
        ]);
      }
      for (const item of items) {
        await upsertItem(tx, restaurantId, item);
      }
    });
    return this.list(restaurantId);
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
