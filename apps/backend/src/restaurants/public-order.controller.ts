import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { NOT_FOUND_PAGE, renderOrderPage } from './order-page.js';
import { OrdersService } from './orders.service.js';
import type { PublicOrder } from './orders.service.js';

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

function toJson(order: PublicOrder) {
  return {
    id: order.id,
    restaurant: { id: order.restaurant_id, name: order.restaurant },
    status: order.status,
    paymentStatus: order.payment_status,
    currency: order.currency,
    total: order.total,
    createdAt: order.created_at,
    items: order.items.map(({ name, quantity, unit_price }) => ({
      name,
      quantity,
      unitPrice: unit_price,
      amount: Math.round(unit_price * quantity * 100) / 100,
    })),
  };
}

// Sin login a proposito: es lo que abre el QR. La proteccion es el token, que
// no se puede adivinar, y que no se muestran datos del cliente. Una persona ve
// la pagina; la app de pago pide lo mismo con Accept: application/json.
@Controller('pedido')
export class PublicOrderController {
  constructor(private readonly orders: OrdersService) {}

  @Get(':token')
  async show(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const order = TOKEN_PATTERN.test(token)
      ? await this.orders.findPublic(token)
      : null;
    response.status(order ? 200 : 404).set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Accept',
    });

    if (request.accepts(['html', 'json']) === 'json') {
      response.json(order ? toJson(order) : { message: 'Pedido no encontrado' });
      return;
    }
    response
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'",
      })
      .send(order ? renderOrderPage(order) : NOT_FOUND_PAGE);
  }
}
