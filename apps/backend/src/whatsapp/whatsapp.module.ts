import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { RestaurantsModule } from '../restaurants/restaurants.module.js';
import {
  ANTHROPIC_CLIENT,
  ClaudeAgentService,
} from './claude-agent.service.js';
import { ConversationService } from './conversation.service.js';
import { ConversationStore } from './conversation.store.js';
import { OdooConversationService } from './odoo-conversation.service.js';
import { WhatsappApiModule } from './whatsapp-api.module.js';
import { WhatsappController } from './whatsapp.controller.js';

@Module({
  imports: [RestaurantsModule, WhatsappApiModule],
  controllers: [WhatsappController],
  providers: [
    { provide: ANTHROPIC_CLIENT, useFactory: () => new Anthropic() },
    ClaudeAgentService,
    ConversationService,
    ConversationStore,
    OdooConversationService,
  ],
})
export class WhatsappModule {}
