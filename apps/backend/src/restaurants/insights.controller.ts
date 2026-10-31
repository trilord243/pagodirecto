import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { Restaurant } from './auth.service.js';
import { InsightsService } from './insights.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';

@Controller('restaurants/insights')
@UseGuards(RestaurantAuthGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  latest(@CurrentRestaurant() restaurant: Restaurant) {
    return this.insights.latest(restaurant.id, restaurant.insightsEnabled);
  }

  @Post()
  @HttpCode(200)
  generate(@CurrentRestaurant() restaurant: Restaurant) {
    return this.insights.generate(restaurant.id, restaurant.insightsEnabled);
  }
}
