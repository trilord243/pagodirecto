import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PlaceOrderInput } from './restaurant.schemas.js';

// El mensaje de este error se le muestra al agente, y el agente al cliente.
export class OrderRejectedError extends Error {}

export interface OrderSummary {
  id: number;
  restaurant: string;
  total: number;
  currency: string;
}

const ORDER_COLUMNS = `
  o.id, o.customer_name, o.customer_phone, o.notes, o.status,
  o.total::float8 as total, o.currency, o.created_at,
  coalesce(
    (select json_agg(json_build_object(
        'name', i.name,
        'quantity', i.quantity,
        'unit_price', i.unit_price::float8) order by i.id)
       from order_items i
      where i.order_id = o.id),
    '[]'::json) as items`;

@Injectable()
export class OrdersService {
  constructor(private readonly db: DatabaseService) {}

  // Los precios salen siempre de la base de datos: el agente solo dice que
  // platos y cuantos, nunca cuanto cuestan.
  place(phone: string, input: PlaceOrderInput): Promise<OrderSummary> {
    return this.db.transaction(async (tx) => {
      const { rows: restaurants } = await tx.query<{
        id: number;
        name: string;
        currency: string;
      }>(
        'select id, name, currency from restaurants where slug = $1 and active',
        [input.restaurante],
      );
      const restaurant = restaurants[0];
      if (!restaurant) {
        throw new OrderRejectedError('Ese restaurante no existe.');
      }

      const { rows: menuItems } = await tx.query<{
        id: number;
        name: string;
        price: string;
      }>(
        `select id, name, price::text as price from menu_items
          where restaurant_id = $1 and id = any($2::int[]) and available`,
        [restaurant.id, input.items.map((item) => item.item_id)],
      );
      const menu = new Map(menuItems.map((item) => [item.id, item]));
      const lines = input.items.map(({ item_id, cantidad }) => {
        const item = menu.get(item_id);
        if (!item) {
          throw new OrderRejectedError(
            `El plato ${item_id} no está disponible en este restaurante.`,
          );
        }
        return { ...item, quantity: cantidad };
      });

      const totalCents = lines.reduce(
        (sum, line) =>
          sum + Math.round(Number(line.price) * 100) * line.quantity,
        0,
      );
      const total = totalCents / 100;

      const { rows: orders } = await tx.query<{ id: number }>(
        `insert into orders
           (restaurant_id, customer_phone, customer_name, notes, total, currency)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          restaurant.id,
          phone,
          input.nombre_cliente,
          input.notas ?? null,
          total,
          restaurant.currency,
        ],
      );
      const orderId = orders[0].id;
      for (const line of lines) {
        await tx.query(
          `insert into order_items (order_id, menu_item_id, name, unit_price, quantity)
           values ($1, $2, $3, $4, $5)`,
          [orderId, line.id, line.name, line.price, line.quantity],
        );
      }

      return {
        id: orderId,
        restaurant: restaurant.name,
        total,
        currency: restaurant.currency,
      };
    });
  }

  async list(restaurantId: number) {
    const { rows } = await this.db.query(
      `select ${ORDER_COLUMNS} from orders o
        where o.restaurant_id = $1
        order by o.created_at desc
        limit 200`,
      [restaurantId],
    );
    return rows;
  }

  async updateStatus(restaurantId: number, orderId: number, status: string) {
    const { rows } = await this.db.query(
      `update orders o
          set status = $3, updated_at = now()
        where o.restaurant_id = $1 and o.id = $2
        returning ${ORDER_COLUMNS}`,
      [restaurantId, orderId, status],
    );
    if (!rows[0]) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return rows[0];
  }
}
