import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { RestaurantsModule } from './restaurants/restaurants.module.js';
import { WhatsappModule } from './whatsapp/whatsapp.module.js';

@Module({
  imports: [DatabaseModule, RestaurantsModule, WhatsappModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
