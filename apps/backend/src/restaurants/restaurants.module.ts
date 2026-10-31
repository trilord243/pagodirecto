import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { RestaurantAgentTools } from './agent-tools.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  MENU_ANALYZER_CLIENT,
  MenuAnalyzerService,
} from './menu-analyzer.service.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { RestaurantAuthGuard } from './restaurant-auth.guard.js';

@Module({
  controllers: [AuthController, MenuController, OrdersController],
  providers: [
    { provide: MENU_ANALYZER_CLIENT, useFactory: () => new Anthropic() },
    AuthService,
    MenuAnalyzerService,
    MenuService,
    OrdersService,
    RestaurantAgentTools,
    RestaurantAuthGuard,
  ],
  exports: [RestaurantAgentTools],
})
export class RestaurantsModule {}
