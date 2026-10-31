import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.service.js';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service.js';
import type { PromotionInput } from './restaurant.schemas.js';
import { renderLoyaltyCard } from './whatsapp-images.js';

export interface Promotion {
  id: number;
  name: string;
  percent: number;
  minPurchases: number;
  minTotal: number;
  active: boolean;
}

export interface LoyaltyProgram {
  stampsRequired: number;
  rewardItemId: number | null;
  rewardName: string | null;
  active: boolean;
}

export interface CardUpdate {
  phone: string;
  stamps: number;
  stampsRequired: number;
  rewardName: string;
  rewardsAvailable: number;
  rewardEarned: boolean;
}

interface ActiveProgram {
  stamps_required: number;
  reward_item_id: number;
  reward_name: string;
  reward_available: boolean;
}

const PROMOTION_COLUMNS = `id, name, percent::float8 as percent,
  min_purchases as "minPurchases", min_total::float8 as "minTotal", active`;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly whatsapp: WhatsappApiService,
  ) {}

  // ---- Configuracion del comercio ----

  async overview(restaurantId: number) {
    const { rows: programs } = await this.db.query<LoyaltyProgram>(
      `select p.stamps_required as "stampsRequired",
              p.reward_item_id as "rewardItemId",
              i.name as "rewardName", p.active
         from loyalty_programs p
         left join menu_items i on i.id = p.reward_item_id
        where p.restaurant_id = $1`,
      [restaurantId],
    );
    const { rows: customers } = await this.db.query(
      `select c.customer_phone as phone,
              (select o.customer_name from orders o
                where o.restaurant_id = c.restaurant_id
                  and o.customer_phone = c.customer_phone
                order by o.created_at desc limit 1) as name,
              c.stamps, c.purchases, c.rewards_available as "rewardsAvailable"
         from loyalty_cards c
        where c.restaurant_id = $1
        order by c.purchases desc
        limit 200`,
      [restaurantId],
    );
    return { program: programs[0] ?? null, customers };
  }

  async saveProgram(
    restaurantId: number,
    program: { stampsRequired: number; rewardItemId: number; active: boolean },
  ) {
    const { rows } = await this.db.query(
      'select id from menu_items where restaurant_id = $1 and id = $2',
      [restaurantId, program.rewardItemId],
    );
    if (!rows[0]) {
      throw new BadRequestException('Escoge un plato de tu menú como premio');
    }
    await this.db.query(
      `insert into loyalty_programs
         (restaurant_id, stamps_required, reward_item_id, active)
       values ($1, $2, $3, $4)
       on conflict (restaurant_id) do update
         set stamps_required = excluded.stamps_required,
             reward_item_id = excluded.reward_item_id,
             active = excluded.active,
             updated_at = now()`,
      [
        restaurantId,
        program.stampsRequired,
        program.rewardItemId,
        program.active,
      ],
    );
    return this.overview(restaurantId);
  }

  async listPromotions(restaurantId: number): Promise<Promotion[]> {
    const { rows } = await this.db.query<Promotion>(
      `select ${PROMOTION_COLUMNS} from promotions
        where restaurant_id = $1
        order by active desc, created_at desc`,
      [restaurantId],
    );
    return rows;
  }

  async createPromotion(
    restaurantId: number,
    promotion: PromotionInput,
  ): Promise<Promotion> {
    const { rows } = await this.db.query<Promotion>(
      `insert into promotions
         (restaurant_id, name, percent, min_purchases, min_total, active)
       values ($1, $2, $3, $4, $5, $6)
       returning ${PROMOTION_COLUMNS}`,
      [
        restaurantId,
        promotion.name,
        promotion.percent,
        promotion.minPurchases,
        promotion.minTotal,
        promotion.active,
      ],
    );
    return rows[0];
  }

  async updatePromotion(
    restaurantId: number,
    id: number,
    patch: Partial<PromotionInput>,
  ): Promise<Promotion> {
    const { rows } = await this.db.query<Promotion>(
      `update promotions
          set name = coalesce($3, name),
              percent = coalesce($4, percent),
              min_purchases = coalesce($5, min_purchases),
              min_total = coalesce($6, min_total),
              active = coalesce($7, active)
        where restaurant_id = $1 and id = $2
        returning ${PROMOTION_COLUMNS}`,
      [
        restaurantId,
        id,
        patch.name ?? null,
        patch.percent ?? null,
        patch.minPurchases ?? null,
        patch.minTotal ?? null,
        patch.active ?? null,
      ],
    );
    if (!rows[0]) {
      throw new NotFoundException('Promoción no encontrada');
    }
    return rows[0];
  }

  async removePromotion(restaurantId: number, id: number): Promise<void> {
    const { rows } = await this.db.query(
      'delete from promotions where restaurant_id = $1 and id = $2 returning id',
      [restaurantId, id],
    );
    if (!rows[0]) {
      throw new NotFoundException('Promoción no encontrada');
    }
  }

  // ---- Lo que usa el agente ----

  private async activeProgram(
    db: Queryable,
    restaurantId: number,
  ): Promise<ActiveProgram | null> {
    const { rows } = await db.query<ActiveProgram>(
      `select p.stamps_required, p.reward_item_id, i.name as reward_name,
              i.available as reward_available
         from loyalty_programs p
         join menu_items i on i.id = p.reward_item_id
        where p.restaurant_id = $1 and p.active`,
      [restaurantId],
    );
    return rows[0] ?? null;
  }

  async publicProgram(restaurantId: number) {
    const program = await this.activeProgram(this.db, restaurantId);
    return program
      ? {
          compras_necesarias: program.stamps_required,
          premio: program.reward_name,
        }
      : null;
  }

  async activePromotions(restaurantId: number) {
    const { rows } = await this.db.query(
      `select name as nombre, percent::float8 as porcentaje,
              min_purchases as compras_minimas,
              min_total::float8 as monto_minimo
         from promotions
        where restaurant_id = $1 and active
        order by percent desc`,
      [restaurantId],
    );
    return rows;
  }

  async cardFor(publicId: string, phone: string) {
    const { rows: restaurants } = await this.db.query<{
      id: number;
      name: string;
    }>('select id, name from restaurants where public_id = $1 and active', [
      publicId,
    ]);
    const restaurant = restaurants[0];
    if (!restaurant) {
      return null;
    }
    const program = await this.activeProgram(this.db, restaurant.id);
    if (!program) {
      return null;
    }
    const { rows } = await this.db.query<{
      stamps: number;
      rewards_available: number;
    }>(
      `select stamps, rewards_available from loyalty_cards
        where restaurant_id = $1 and customer_phone = $2`,
      [restaurant.id, phone],
    );
    return {
      restaurant: restaurant.name,
      stamps: rows[0]?.stamps ?? 0,
      stampsRequired: program.stamps_required,
      rewardName: program.reward_name,
      rewardsAvailable: rows[0]?.rewards_available ?? 0,
    };
  }

  // ---- Lo que usa el pedido ----

  async standing(db: Queryable, restaurantId: number, phone: string) {
    const { rows } = await db.query<{
      purchases: number;
      rewards_available: number;
    }>(
      `select purchases, rewards_available from loyalty_cards
        where restaurant_id = $1 and customer_phone = $2`,
      [restaurantId, phone],
    );
    const program = await this.activeProgram(db, restaurantId);
    const hasReward =
      (rows[0]?.rewards_available ?? 0) > 0 && program?.reward_available;
    return {
      purchases: rows[0]?.purchases ?? 0,
      reward:
        hasReward && program
          ? { id: program.reward_item_id, name: program.reward_name }
          : null,
    };
  }

  // Se aplica una sola promocion, la mejor para el cliente.
  async bestPromotion(
    db: Queryable,
    restaurantId: number,
    purchases: number,
    subtotal: number,
  ) {
    const { rows } = await db.query<{ name: string; percent: number }>(
      `select name, percent::float8 as percent from promotions
        where restaurant_id = $1 and active
          and min_purchases <= $2 and min_total <= $3
        order by percent desc
        limit 1`,
      [restaurantId, purchases, subtotal],
    );
    return rows[0] ?? null;
  }

  async redeem(db: Queryable, restaurantId: number, phone: string) {
    const { rows } = await db.query(
      `update loyalty_cards
          set rewards_available = rewards_available - 1
        where restaurant_id = $1 and customer_phone = $2
          and rewards_available > 0
        returning customer_phone`,
      [restaurantId, phone],
    );
    if (!rows[0]) {
      throw new BadRequestException('El premio ya fue usado');
    }
  }

  async registerPurchase(
    db: Queryable,
    restaurantId: number,
    phone: string,
  ): Promise<CardUpdate | null> {
    await db.query(
      `insert into loyalty_cards (restaurant_id, customer_phone)
       values ($1, $2)
       on conflict do nothing`,
      [restaurantId, phone],
    );
    const { rows: cards } = await db.query<{
      stamps: number;
      rewards_available: number;
    }>(
      `update loyalty_cards set purchases = purchases + 1
        where restaurant_id = $1 and customer_phone = $2
        returning stamps, rewards_available`,
      [restaurantId, phone],
    );
    const program = await this.activeProgram(db, restaurantId);
    if (!program) {
      return null;
    }

    const stamps = cards[0].stamps + 1;
    const rewardEarned = stamps >= program.stamps_required;
    const rewardsAvailable = cards[0].rewards_available + (rewardEarned ? 1 : 0);
    await db.query(
      `update loyalty_cards set stamps = $3, rewards_available = $4
        where restaurant_id = $1 and customer_phone = $2`,
      [restaurantId, phone, rewardEarned ? 0 : stamps, rewardsAvailable],
    );
    return {
      phone,
      // Al completarla se muestra llena, aunque ya empiece de cero.
      stamps,
      stampsRequired: program.stamps_required,
      rewardName: program.reward_name,
      rewardsAvailable,
      rewardEarned,
    };
  }

  // Si WhatsApp falla, la compra ya quedo contada: no se le avisa y ya.
  async notifyStamp(restaurant: { name: string }, card: CardUpdate) {
    try {
      await this.whatsapp.sendImage(
        card.phone,
        await renderLoyaltyCard({ ...card, restaurant: restaurant.name }),
        card.rewardEarned
          ? `¡Completaste tu tarjeta en ${restaurant.name}! Tu premio: ${card.rewardName}. Escríbeme cuando quieras usarlo.`
          : `¡Sumaste una compra en ${restaurant.name}! Llevas ${card.stamps} de ${card.stampsRequired}.`,
      );
    } catch (error) {
      this.logger.warn(`Tarjeta sin enviar: ${String(error)}`);
    }
  }
}
