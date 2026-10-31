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
import { WhatsappApiService } from './whatsapp-api.service.js';
import { WhatsappController } from './whatsapp.controller.js';

@Module({
  imports: [RestaurantsModule],
  controllers: [WhatsappController],
  providers: [
    { provide: ANTHROPIC_CLIENT, useFactory: () => new Anthropic() },
    ClaudeAgentService,
    ConversationService,
    ConversationStore,
    OdooConversationService,
    WhatsappApiService,
  ],
})
export class WhatsappModule {}
