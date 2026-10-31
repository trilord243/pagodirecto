import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConversationService } from './conversation.service.js';
import { readConfig } from './whatsapp.config.js';
import {
  extractInboundMessages,
  isValidSignature,
  safeEqual,
} from './whatsapp.webhook.js';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly conversations: ConversationService) {}

  @Get('health')
  health() {
    const config = readConfig();
    return {
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      agent: Boolean(config.agentId && config.environmentId),
      verifyToken: Boolean(config.verifyToken),
      appSecret: Boolean(config.appSecret),
      accessToken: Boolean(config.accessToken),
      phoneNumberId: Boolean(config.phoneNumberId),
      allowAllNumbers: config.allowAllNumbers,
      allowedNumbers: config.allowedNumbers.size,
    };
  }

  @Get('webhook')
  verify(
    @Res({ passthrough: true }) response: Response,
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const { verifyToken } = readConfig();
    if (
      mode !== 'subscribe' ||
      !verifyToken ||
      !safeEqual(token ?? '', verifyToken)
    ) {
      throw new ForbiddenException();
    }
    response.type('text/plain');
    return challenge ?? '';
  }

  @Post('webhook')
  @HttpCode(200)
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ): void {
    const { appSecret, phoneNumberId } = readConfig();
    if (!isValidSignature(request.rawBody, signature, appSecret)) {
      throw new ForbiddenException();
    }
    for (const message of extractInboundMessages(request.body, phoneNumberId)) {
      void this.conversations.enqueue(message);
    }
  }
}
