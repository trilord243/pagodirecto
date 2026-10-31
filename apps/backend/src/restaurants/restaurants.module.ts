import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { WhatsappApiModule } from '../whatsapp/whatsapp-api.module.js';
import { RestaurantAgentTools } from './agent-tools.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  MENU_ANALYZER_CLIENT,
  MenuAnalyzerService,
} from './menu-analyzer.service.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { LoyaltyController } from './loyalty.controller.js';
import { LoyaltyService } from './loyalty.service.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PublicOrderController } from './public-order.controller.js';
import { RestaurantAuthGuard } from './restaurant-auth.guard.js';

@Module({
  imports: [WhatsappApiModule],
  controllers: [
    AuthController,
    InsightsController,
    LoyaltyController,
    MenuController,
    OrdersController,
    PublicOrderController,
  ],
  providers: [
    { provide: MENU_ANALYZER_CLIENT, useFactory: () => new Anthropic() },
    AuthService,
    InsightsService,
    LoyaltyService,
    MenuAnalyzerService,
    MenuService,
    OrdersService,
    RestaurantAgentTools,
    RestaurantAuthGuard,
  ],
  exports: [RestaurantAgentTools],
})
export class RestaurantsModule {}
