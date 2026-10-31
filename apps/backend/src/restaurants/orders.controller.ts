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
import { OrdersService } from './orders.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';
import { parseBody, UpdateOrderSchema } from './restaurant.schemas.js';

@Controller('restaurants/orders')
@UseGuards(RestaurantAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentRestaurant() restaurant: Restaurant) {
    return this.orders.list(restaurant.id);
  }

  @Patch(':id')
  update(
    @CurrentRestaurant() restaurant: Restaurant,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.orders.update(
      restaurant.id,
      id,
      parseBody(UpdateOrderSchema, body),
    );
  }
}
