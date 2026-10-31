import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Restaurant } from './auth.service.js';
import { MenuAnalyzerService } from './menu-analyzer.service.js';
import { MenuService } from './menu.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';
import {
  ConfirmMenuSchema,
  CreateMenuItemSchema,
  parseBody,
  UpdateMenuItemSchema,
} from './restaurant.schemas.js';

// Es el tope de Claude para una imagen.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller('restaurants/menu')
@UseGuards(RestaurantAuthGuard)
export class MenuController {
  constructor(
    private readonly analyzer: MenuAnalyzerService,
    private readonly menu: MenuService,
  ) {}

  // No guarda nada: devuelve lo leido para que el restaurante lo corrija.
  @Post('analyze')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  analyze(@UploadedFile() image?: Express.Multer.File) {
    if (!image) {
      throw new BadRequestException('Falta la imagen en el campo "image"');
    }
    return this.analyzer.analyze(image.buffer);
  }

  @Post('confirm')
  @HttpCode(200)
  confirm(@CurrentRestaurant() restaurant: Restaurant, @Body() body: unknown) {
    const { items, currency } = parseBody(ConfirmMenuSchema, body);
    return this.menu.confirm(restaurant.id, items, currency);
  }

  @Get('items')
  list(@CurrentRestaurant() restaurant: Restaurant) {
    return this.menu.list(restaurant.id);
  }

  @Post('items')
  create(@CurrentRestaurant() restaurant: Restaurant, @Body() body: unknown) {
    return this.menu.create(
      restaurant.id,
      parseBody(CreateMenuItemSchema, body),
    );
  }

  @Patch('items/:id')
  update(
    @CurrentRestaurant() restaurant: Restaurant,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    return this.menu.update(
      restaurant.id,
      id,
      parseBody(UpdateMenuItemSchema, body),
    );
  }

  @Delete('items/:id')
  @HttpCode(204)
  remove(
    @CurrentRestaurant() restaurant: Restaurant,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.menu.remove(restaurant.id, id);
  }
}
