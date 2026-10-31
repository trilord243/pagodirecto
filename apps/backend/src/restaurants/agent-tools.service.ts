import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service.js';
import { LoyaltyService } from './loyalty.service.js';
import { groupByCategory } from './menu.service.js';
import { formatMoney } from './order-page.js';
import { OrderRejectedError, OrdersService } from './orders.service.js';
import type { Customer } from './orders.service.js';
import { PlaceOrderSchema, SendOptionsSchema } from './restaurant.schemas.js';
import {
  renderLoyaltyCard,
  renderQr,
  renderRestaurantsImage,
} from './whatsapp-images.js';

export const LIST_RESTAURANTS_TOOL = 'listar_restaurantes';
export const SEND_RESTAURANTS_IMAGE_TOOL = 'enviar_foto_restaurantes';
export const SHOW_MENU_TOOL = 'ver_menu';
export const SEND_OPTIONS_TOOL = 'enviar_opciones';
export const QUOTE_ORDER_TOOL = 'calcular_pedido';
export const PLACE_ORDER_TOOL = 'crear_pedido';
export const SEND_CARD_TOOL = 'ver_tarjeta';

// Estas herramientas le envian algo al cliente por si solas.
export const MESSAGE_TOOLS = new Set([
  SEND_RESTAURANTS_IMAGE_TOOL,
  SEND_OPTIONS_TOOL,
  PLACE_ORDER_TOOL,
  SEND_CARD_TOOL,
]);

// Su mensaje se le muestra al agente. Cualquier otro error se oculta.
export class AgentToolError extends Error {}

function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'https://pedidos.example.com';
}

@Injectable()
export class RestaurantAgentTools {
  private readonly logger = new Logger(RestaurantAgentTools.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly loyalty: LoyaltyService,
    private readonly orders: OrdersService,
    private readonly whatsapp: WhatsappApiService,
  ) {}

  // El telefono llega de Meta y no del agente: un cliente no puede pedir a
  // nombre de otro, y el numero nunca pasa por Claude.
  async execute(
    customer: Customer,
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    switch (name) {
      case LIST_RESTAURANTS_TOOL:
        return JSON.stringify(await this.listRestaurants());
      case SEND_RESTAURANTS_IMAGE_TOOL:
        return JSON.stringify(await this.sendRestaurantsImage(customer.phone));
      case SHOW_MENU_TOOL:
        return JSON.stringify(await this.showMenu(String(input.restaurante)));
      case SEND_OPTIONS_TOOL:
        return this.sendOptions(customer.phone, input);
      case QUOTE_ORDER_TOOL:
        return JSON.stringify(await this.quoteOrder(customer, input));
      case PLACE_ORDER_TOOL:
        return JSON.stringify(await this.placeOrder(customer, input));
      case SEND_CARD_TOOL:
        return JSON.stringify(
          await this.sendCard(customer.phone, String(input.restaurante)),
        );
      default:
        throw new AgentToolError(`Herramienta desconocida: ${name}`);
    }
  }

  private async listRestaurants() {
    const { rows } = await this.db.query<{ id: string; nombre: string }>(
      `select r.public_id as id, r.name as nombre
         from restaurants r
        where r.active
          and exists (select 1 from menu_items i
                       where i.restaurant_id = r.id and i.available)
        order by r.name`,
    );
    return rows;
  }

  private async sendRestaurantsImage(phone: string) {
    const restaurants = await this.listRestaurants();
    if (restaurants.length === 0) {
      throw new AgentToolError('Todavia no hay restaurantes con menu.');
    }
    await this.whatsapp.sendImage(
      phone,
      await renderRestaurantsImage(
        restaurants.map(({ id, nombre }) => ({ id, name: nombre })),
      ),
    );
    return restaurants;
  }

  private async showMenu(publicId: string) {
    const { rows: restaurants } = await this.db.query<{
      id: number;
      name: string;
      currency: string;
    }>(
      'select id, name, currency from restaurants where public_id = upper($1) and active',
      [publicId.trim()],
    );
    const restaurant = restaurants[0];
    if (!restaurant) {
      throw new AgentToolError('Ese restaurante no existe.');
    }
    const { rows: items } = await this.db.query<{
      category: string | null;
    }>(
      `select id as item_id, name as nombre, description as descripcion,
              category, price::float8 as precio
         from menu_items
        where restaurant_id = $1 and available
        order by category nulls last, name`,
      [restaurant.id],
    );
    return {
      restaurante: restaurant.name,
      moneda: restaurant.currency,
      categorias: groupByCategory(items),
      promociones: await this.loyalty.activePromotions(restaurant.id),
      tarjeta: await this.loyalty.publicProgram(restaurant.id),
    };
  }

  private async sendOptions(
    phone: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const parsed = SendOptionsSchema.safeParse(input);
    if (!parsed.success) {
      throw new AgentToolError(
        'Las opciones deben ser entre 2 y 10, con id y titulo.',
      );
    }
    const { texto, boton, opciones } = parsed.data;
    await this.whatsapp.sendOptions(
      phone,
      texto,
      boton ?? 'Ver opciones',
      opciones.map(({ id, titulo, descripcion }) => ({
        id,
        title: titulo,
        description: descripcion ?? undefined,
      })),
    );
    return 'Opciones enviadas. Espera la respuesta del cliente.';
  }

  private async sendCard(phone: string, publicId: string) {
    const card = await this.loyalty.cardFor(publicId.trim().toUpperCase(), phone);
    if (!card) {
      throw new AgentToolError('Este comercio no tiene tarjeta de fidelidad.');
    }
    await this.whatsapp.sendImage(phone, await renderLoyaltyCard(card));
    return {
      compras: card.stamps,
      compras_necesarias: card.stampsRequired,
      premio: card.rewardName,
      premios_disponibles: card.rewardsAvailable,
    };
  }

  private async quoteOrder(customer: Customer, input: Record<string, unknown>) {
    const parsed = PlaceOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new AgentToolError('Datos del pedido incompletos.');
    }
    try {
      const quote = await this.orders.quote(customer, parsed.data);
      return {
        lineas: quote.lines.map(({ name, quantity, amount }) => ({
          nombre: name,
          cantidad: quantity,
          monto: amount,
        })),
        subtotal: quote.subtotal,
        descuento: quote.discount,
        promocion: quote.promotion,
        total: quote.total,
        moneda: quote.currency,
        premio_disponible: quote.reward?.name ?? null,
        premio_incluido: quote.rewardApplied,
      };
    } catch (error) {
      if (error instanceof OrderRejectedError) {
        throw new AgentToolError(error.message);
      }
      throw error;
    }
  }

  private async placeOrder(customer: Customer, input: Record<string, unknown>) {
    const parsed = PlaceOrderSchema.safeParse(input);
    if (!parsed.success) {
      throw new AgentToolError('Datos del pedido incompletos.');
    }

    let order;
    try {
      order = await this.orders.place(customer, parsed.data);
    } catch (error) {
      if (error instanceof OrderRejectedError) {
        throw new AgentToolError(error.message);
      }
      throw error;
    }

    const url = `${publicBaseUrl()}/pedido/${order.token}`;
    const result = {
      pedido: order.id,
      restaurante: order.restaurant,
      subtotal: order.subtotal,
      descuento: order.discount,
      total: order.total,
      moneda: order.currency,
      enlace: url,
    };
    // El pedido ya existe: un fallo aqui no puede volver como error, o el
    // agente lo crearia de nuevo.
    try {
      await this.whatsapp.sendImage(
        customer.phone,
        await renderQr(url),
        `Pedido ${order.id} en ${order.restaurant}\nTotal: ${formatMoney(order.total, order.currency)}\n\nEscanea el QR o abre este enlace:\n${url}`,
      );
      return { ...result, qr_enviado: true };
    } catch (error) {
      this.logger.error(`QR del pedido ${order.id}: ${String(error)}`);
      return { ...result, qr_enviado: false };
    }
  }
}
