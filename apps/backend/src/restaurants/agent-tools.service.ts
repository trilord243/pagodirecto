import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { OrderRejectedError, OrdersService } from './orders.service.js';
import { PlaceOrderSchema } from './restaurant.schemas.js';

export const LIST_RESTAURANTS_TOOL = 'listar_restaurantes';
export const SHOW_MENU_TOOL = 'ver_menu';
export const PLACE_ORDER_TOOL = 'crear_pedido';

// Su mensaje se le muestra al agente. Cualquier otro error se oculta.
export class AgentToolError extends Error {}

@Injectable()
export class RestaurantAgentTools {
  constructor(
    private readonly db: DatabaseService,
    private readonly orders: OrdersService,
  ) {}

  // El telefono llega de Meta y no del agente: un cliente no puede pedir a
  // nombre de otro, y el numero nunca pasa por Claude.
  async execute(
    phone: string,
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    switch (name) {
      case LIST_RESTAURANTS_TOOL:
        return JSON.stringify(await this.listRestaurants());
      case SHOW_MENU_TOOL:
        return JSON.stringify(await this.showMenu(String(input.restaurante)));
      case PLACE_ORDER_TOOL:
        return JSON.stringify(await this.placeOrder(phone, input));
      default:
        throw new AgentToolError(`Herramienta desconocida: ${name}`);
    }
  }

  private async listRestaurants() {
    const { rows } = await this.db.query(
      `select r.slug as restaurante, r.name as nombre
         from restaurants r
        where r.active
          and exists (select 1 from menu_items i
                       where i.restaurant_id = r.id and i.available)
        order by r.name`,
    );
    return rows;
  }

  private async showMenu(slug: string) {
    const { rows: restaurants } = await this.db.query<{
      id: number;
      name: string;
      currency: string;
    }>('select id, name, currency from restaurants where slug = $1 and active', [
      slug,
    ]);
    const restaurant = restaurants[0];
    if (!restaurant) {
      throw new AgentToolError('Ese restaurante no existe.');
    }
    const { rows: items } = await this.db.query(
      `select id as item_id, name as nombre, description as descripcion,
              category as categoria, price::float8 as precio
         from menu_items
        where restaurant_id = $1 and available
        order by category nulls last, name`,
      [restaurant.id],
    );
    return { restaurante: restaurant.name, moneda: restaurant.currency, items };
  }

  private async placeOrder(phone: string, input: Record<string, unknown>) {
    const parsed = PlaceOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new AgentToolError('Datos del pedido incompletos.');
    }
    try {
      const order = await this.orders.place(phone, parsed.data);
      return {
        pedido: order.id,
        restaurante: order.restaurant,
        total: order.total,
        moneda: order.currency,
      };
    } catch (error) {
      if (error instanceof OrderRejectedError) {
        throw new AgentToolError(error.message);
      }
      throw error;
    }
  }
}
