import { Module } from '@nestjs/common';
import { WhatsappApiService } from './whatsapp-api.service.js';

@Module({
  providers: [WhatsappApiService],
  exports: [WhatsappApiService],
})
export class WhatsappApiModule {}
