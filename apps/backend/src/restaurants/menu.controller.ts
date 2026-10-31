import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Restaurant } from './auth.service.js';
import { MenuAnalyzerService } from './menu-analyzer.service.js';
import { MenuService } from './menu.service.js';
import {
  CurrentRestaurant,
  RestaurantAuthGuard,
} from './restaurant-auth.guard.js';
import {
  CreateMenuItemSchema,
  parseBody,
  PublishMenuSchema,
  UpdateMenuItemSchema,
} from './restaurant.schemas.js';

// Son los limites que el portal le muestra al comercio.
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ANALYSES_PER_HOUR = 10;
const HOUR_MS = 3_600_000;

@Controller('restaurants/menu')
@UseGuards(RestaurantAuthGuard)
export class MenuController {
  private readonly recentAnalyses = new Map<number, number[]>();

  constructor(
    private readonly analyzer: MenuAnalyzerService,
    private readonly menu: MenuService,
  ) {}

  @Get()
  get(@CurrentRestaurant() restaurant: Restaurant) {
    return this.menu.get(restaurant.id);
  }

  @Put()
  publish(@CurrentRestaurant() restaurant: Restaurant, @Body() body: unknown) {
    return this.menu.publish(restaurant.id, parseBody(PublishMenuSchema, body));
  }

  // No guarda nada: devuelve lo leido para que el comercio lo corrija.
  @Post('analyze')
  @HttpCode(200)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  analyze(
    @CurrentRestaurant() restaurant: Restaurant,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Falta el menú en el campo "files"');
    }
    this.limitAnalyses(restaurant.id);
    return this.analyzer.analyze(files.map((file) => file.buffer));
  }

  // Cada analisis lo paga la cuenta de Anthropic y cualquiera puede registrarse.
  private limitAnalyses(restaurantId: number): void {
    const now = Date.now();
    const recent = (this.recentAnalyses.get(restaurantId) ?? []).filter(
      (timestamp) => now - timestamp < HOUR_MS,
    );
    if (recent.length >= MAX_ANALYSES_PER_HOUR) {
      throw new HttpException(
        'Llegaste al límite de análisis por hora. Intenta más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.recentAnalyses.set(restaurantId, [...recent, now]);
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
