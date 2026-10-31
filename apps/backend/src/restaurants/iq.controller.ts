import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { Restaurant } from './auth.service.js';
import { IqService } from './iq.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';

@Controller('restaurants/iq')
@UseGuards(RestaurantAuthGuard)
export class IqController {
  constructor(private readonly iq: IqService) {}

  // mode=demo, la vitrina con cifras de ejemplo, esta abierta a todos.
  // mode=real exige tener el plan activo.
  @Get()
  dashboard(
    @CurrentRestaurant() restaurant: Restaurant,
    @Query('mode') mode?: string,
  ) {
    return this.iq.dashboard(restaurant, mode);
  }
}
