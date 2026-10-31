import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.service.js';
import { LoyaltyService } from './loyalty.service.js';
import type { CardUpdate } from './loyalty.service.js';
import type { PlaceOrderInput } from './restaurant.schemas.js';

// El mensaje de este error se le muestra al agente, y el agente al cliente.
export class OrderRejectedError extends Error {}

const DEFAULT_CUSTOMER_NAME = 'Cliente de WhatsApp';
const MAX_CUSTOMER_NAME = 120;

// El nombre es el del perfil de WhatsApp: el agente ya no se lo pregunta.
export interface Customer {
  phone: string;
  name?: string;
}

export interface OrderSummary {
  id: number;
  restaurant: string;
  token: string;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
}

export interface OrderQuote {
  lines: { name: string; quantity: number; amount: number }[];
  subtotal: number;
  discount: number;
  promotion: string | null;
  total: number;
  currency: string;
  reward: { id: number; name: string } | null;
  rewardApplied: boolean;
}

export interface PublicOrder {
  id: number;
  restaurant: string;
  restaurant_id: string;
  status: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  promotion_name: string | null;
  total: number;
  currency: string;
  created_at: Date;
  items: { name: string; quantity: number; unit_price: number }[];
}

interface PricedLine {
  id: number;
  name: string;
  price: string;
  quantity: number;
}

interface PricedOrder {
  restaurant: { id: number; name: string; currency: string };
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  promotion: string | null;
  reward: { id: number; name: string } | null;
  rewardApplied: boolean;
}

const ORDER_ITEMS = `
  coalesce(
    (select json_agg(json_build_object(
        'name', i.name,
        'quantity', i.quantity,
        'unit_price', i.unit_price::float8) order by i.id)
       from order_items i
      where i.order_id = o.id),
    '[]'::json) as items`;

const ORDER_COLUMNS = `
  o.id, o.customer_name, o.customer_phone, o.notes, o.status, o.payment_status,
  o.public_token, o.subtotal::float8 as subtotal, o.discount::float8 as discount,
  o.promotion_name, o.reward_redeemed, o.total::float8 as total, o.currency,
  o.created_at, ${ORDER_ITEMS}`;

const toCents = (price: string) => Math.round(Number(price) * 100);

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly loyalty: LoyaltyService,
  ) {}

  // Precios y descuentos salen siempre de la base de datos: el agente solo dice
  // que platos y cuantos, nunca cuanto cuestan ni cuanto se rebaja.
  private async price(
    db: Queryable,
    phone: string,
    input: PlaceOrderInput,
  ): Promise<PricedOrder> {
    const { rows: restaurants } = await db.query<{
      id: number;
      name: string;
      currency: string;
    }>(
      'select id, name, currency from restaurants where public_id = $1 and active',
      [input.restaurante],
    );
    const restaurant = restaurants[0];
    if (!restaurant) {
      throw new OrderRejectedError('Ese restaurante no existe.');
    }

    const { rows: menuItems } = await db.query<{
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

    const subtotalCents = lines.reduce(
      (sum, line) => sum + toCents(line.price) * line.quantity,
      0,
    );
    const { purchases, reward } = await this.loyalty.standing(
      db,
      restaurant.id,
      phone,
    );
    const promotion = await this.loyalty.bestPromotion(
      db,
      restaurant.id,
      purchases,
      subtotalCents / 100,
    );
    if (input.usar_recompensa && !reward) {
      throw new OrderRejectedError('El cliente no tiene un premio disponible.');
    }

    return {
      restaurant,
      lines,
      subtotalCents,
      discountCents: promotion
        ? Math.round((subtotalCents * promotion.percent) / 100)
        : 0,
      promotion: promotion?.name ?? null,
      reward,
      rewardApplied: Boolean(input.usar_recompensa),
    };
  }

  async quote(
    { phone }: Customer,
    input: PlaceOrderInput,
  ): Promise<OrderQuote> {
    const priced = await this.price(this.db, phone, input);
    const lines = priced.lines.map(({ name, price, quantity }) => ({
      name,
      quantity,
      amount: (toCents(price) * quantity) / 100,
    }));
    if (priced.rewardApplied && priced.reward) {
      lines.push({ name: priced.reward.name, quantity: 1, amount: 0 });
    }
    return {
      lines,
      subtotal: priced.subtotalCents / 100,
      discount: priced.discountCents / 100,
      promotion: priced.promotion,
      total: (priced.subtotalCents - priced.discountCents) / 100,
      currency: priced.restaurant.currency,
      reward: priced.reward,
      rewardApplied: priced.rewardApplied,
    };
  }

  place(
    { phone, name }: Customer,
    input: PlaceOrderInput,
  ): Promise<OrderSummary> {
    return this.db.transaction(async (tx) => {
      const priced = await this.price(tx, phone, input);
      const { restaurant, reward, rewardApplied } = priced;
      const totalCents = priced.subtotalCents - priced.discountCents;

      if (rewardApplied) {
        await this.loyalty.redeem(tx, restaurant.id, phone);
      }

      const { rows: orders } = await tx.query<{
        id: number;
        public_token: string;
      }>(
        `insert into orders
           (restaurant_id, customer_phone, customer_name, notes, subtotal,
            discount, promotion_name, reward_redeemed, total, currency)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id, public_token`,
        [
          restaurant.id,
          phone,
          name?.trim().slice(0, MAX_CUSTOMER_NAME) || DEFAULT_CUSTOMER_NAME,
          input.notas ?? null,
          priced.subtotalCents / 100,
          priced.discountCents / 100,
          priced.promotion,
          rewardApplied,
          totalCents / 100,
          restaurant.currency,
        ],
      );
      const order = orders[0];
      const lines = [...priced.lines];
      if (rewardApplied && reward) {
        lines.push({ ...reward, price: '0', quantity: 1 });
      }
      for (const line of lines) {
        await tx.query(
          `insert into order_items (order_id, menu_item_id, name, unit_price, quantity)
           values ($1, $2, $3, $4, $5)`,
          [order.id, line.id, line.name, line.price, line.quantity],
        );
      }

      return {
        id: order.id,
        restaurant: restaurant.name,
        token: order.public_token,
        subtotal: priced.subtotalCents / 100,
        discount: priced.discountCents / 100,
        total: totalCents / 100,
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

  // Una compra cuenta para la tarjeta cuando se paga, no cuando se pide: si
  // no, bastaria con hacer pedidos sin pagarlos para llevarse el premio.
  update(
    restaurantId: number,
    orderId: number,
    patch: { status?: string; paymentStatus?: string },
  ): Promise<{ order: unknown; card: CardUpdate | null }> {
    return this.db.transaction(async (tx) => {
      const { rows: current } = await tx.query<{
        customer_phone: string;
        loyalty_counted: boolean;
      }>(
        `select customer_phone, loyalty_counted from orders
          where restaurant_id = $1 and id = $2
          for update`,
        [restaurantId, orderId],
      );
      if (!current[0]) {
        throw new NotFoundException('Pedido no encontrado');
      }
      const counts =
        patch.paymentStatus === 'paid' && !current[0].loyalty_counted;

      const { rows } = await tx.query(
        `update orders o
            set status = coalesce($3, o.status),
                payment_status = coalesce($4, o.payment_status),
                loyalty_counted = o.loyalty_counted or $5,
                updated_at = now()
          where o.restaurant_id = $1 and o.id = $2
          returning ${ORDER_COLUMNS}`,
        [
          restaurantId,
          orderId,
          patch.status ?? null,
          patch.paymentStatus ?? null,
          counts,
        ],
      );
      const card = counts
        ? await this.loyalty.registerPurchase(
            tx,
            restaurantId,
            current[0].customer_phone,
          )
        : null;
      return { order: rows[0], card };
    });
  }

  // Lo que ve quien abre el QR. El telefono, el nombre y la direccion del
  // cliente se quedan fuera: el enlace puede terminar en manos de cualquiera.
  async findPublic(token: string): Promise<PublicOrder | null> {
    const { rows } = await this.db.query<PublicOrder>(
      `select o.id, r.name as restaurant, r.public_id as restaurant_id,
              o.status, o.payment_status, o.subtotal::float8 as subtotal,
              o.discount::float8 as discount, o.promotion_name,
              o.total::float8 as total, o.currency, o.created_at, ${ORDER_ITEMS}
         from orders o
         join restaurants r on r.id = o.restaurant_id
        where o.public_token = $1`,
      [token],
    );
    return rows[0] ?? null;
  }
}
