import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { Restaurant } from './auth.service.js';
import { LoyaltyService } from './loyalty.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';
import {
  CreatePromotionSchema,
  LoyaltyProgramSchema,
  parseBody,
  UpdatePromotionSchema,
} from './restaurant.schemas.js';

@Controller('restaurants')
@UseGuards(RestaurantAuthGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('loyalty')
  overview(@CurrentRestaurant() restaurant: Restaurant) {
    return this.loyalty.overview(restaurant.id);
  }

  @Put('loyalty')
  save(@CurrentRestaurant() restaurant: Restaurant, @Body() body: unknown) {
    return this.loyalty.saveProgram(
      restaurant.id,
      parseBody(LoyaltyProgramSchema, body),
    );
  }

  @Get('promotions')
  promotions(@CurrentRestaurant() restaurant: Restaurant) {
    return this.loyalty.listPromotions(restaurant.id);
  }

  @Post('promotions')
  create(@CurrentRestaurant() restaurant: Restaurant, @Body() body: unknown) {
    return this.loyalty.createPromotion(
      restaurant.id,
      parseBody(CreatePromotionSchema, body),
    );
  }

  @Patch('promotions/:id')
  update(
    @CurrentRestaurant() restaurant: Restaurant,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.loyalty.updatePromotion(
      restaurant.id,
      id,
      parseBody(UpdatePromotionSchema, body),
    );
  }

  @Delete('promotions/:id')
  @HttpCode(204)
  remove(
    @CurrentRestaurant() restaurant: Restaurant,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.loyalty.removePromotion(restaurant.id, id);
  }
}
