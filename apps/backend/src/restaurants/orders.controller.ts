import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { Restaurant } from './auth.service.js';
import { LoyaltyService } from './loyalty.service.js';
import { OrdersService } from './orders.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';
import { parseBody, UpdateOrderSchema } from './restaurant.schemas.js';

@Controller('restaurants/orders')
@UseGuards(RestaurantAuthGuard)
export class OrdersController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  list(@CurrentRestaurant() restaurant: Restaurant) {
    return this.orders.list(restaurant.id);
  }

  @Patch(':id')
  async update(
    @CurrentRestaurant() restaurant: Restaurant,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const { order, card } = await this.orders.update(
      restaurant.id,
      id,
      parseBody(UpdateOrderSchema, body),
    );
    if (card) {
      void this.loyalty.notifyStamp(restaurant, card);
    }
    return order;
  }
}
