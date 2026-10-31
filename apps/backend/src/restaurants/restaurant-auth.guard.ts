import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { Restaurant } from './auth.service.js';

interface AuthenticatedRequest extends Request {
  restaurant: Restaurant;
}

export function bearerToken(header: string | undefined): string | undefined {
  return header?.match(/^Bearer (.+)$/)?.[1];
}

@Injectable()
export class RestaurantAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    const restaurant = token ? await this.auth.authenticate(token) : null;
    if (!restaurant) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }
    request.restaurant = restaurant;
    return true;
  }
}

export const CurrentRestaurant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Restaurant =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().restaurant,
);
