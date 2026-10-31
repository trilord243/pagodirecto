import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { Restaurant } from './auth.service.js';
import {
  bearerToken,
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';
import {
  LoginSchema,
  parseBody,
  RegisterSchema,
} from './restaurant.schemas.js';

@Controller('restaurants')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const { username, password } = parseBody(LoginSchema, body);
    return this.auth.login(username, password);
  }

  @Post('auth/register')
  register(@Body() body: unknown) {
    const { name, username, password } = parseBody(RegisterSchema, body);
    return this.auth.register(name, username, password);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(RestaurantAuthGuard)
  logout(@Headers('authorization') header: string): Promise<void> {
    return this.auth.logout(bearerToken(header)!);
  }

  @Get('me')
  @UseGuards(RestaurantAuthGuard)
  me(@CurrentRestaurant() restaurant: Restaurant): Restaurant {
    return restaurant;
  }
}
