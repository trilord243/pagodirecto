import { Injectable } from '@nestjs/common';
import { readConfig } from './whatsapp.config.js';

const MAX_MESSAGE_LENGTH = 4096;
// Limites de los mensajes interactivos de WhatsApp.
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_ROW_TITLE = 24;
const MAX_ROW_DESCRIPTION = 72;

export interface ReplyOption {
  id: string;
  title: string;
  description?: string;
}

@Injectable()
export class WhatsappApiService {
  async sendText(to: string, body: string): Promise<void> {
    for (let start = 0; start < body.length; start += MAX_MESSAGE_LENGTH) {
      await this.sendMessage({
        to,
        type: 'text',
        text: { body: body.slice(start, start + MAX_MESSAGE_LENGTH) },
      });
    }
  }

  async sendImage(to: string, png: Buffer, caption?: string): Promise<void> {
    const id = await this.uploadPng(png);
    await this.sendMessage({ to, type: 'image', image: { id, caption } });
  }

  // Hasta tres opciones van como botones; mas, como lista desplegable.
  async sendOptions(
    to: string,
    body: string,
    button: string,
    options: ReplyOption[],
  ): Promise<void> {
    if (options.length <= MAX_BUTTONS) {
      await this.sendMessage({
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: options.map(({ id, title }) => ({
              type: 'reply',
              reply: { id, title: title.slice(0, MAX_BUTTON_TITLE) },
            })),
          },
        },
      });
      return;
    }
    await this.sendMessage({
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button,
          sections: [
            {
              rows: options.map(({ id, title, description }) => ({
                id,
                title: title.slice(0, MAX_ROW_TITLE),
                // Lo que no cabe en el titulo se lee en la descripcion.
                description: (
                  description ??
                  (title.length > MAX_ROW_TITLE ? title : undefined)
                )?.slice(0, MAX_ROW_DESCRIPTION),
              })),
            },
          ],
        },
      },
    });
  }

  private async uploadPng(png: Buffer): Promise<string> {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', 'image/png');
    form.set(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'imagen.png',
    );
    const { id } = await this.request<{ id: string }>('media', form);
    return id;
  }

  private async sendMessage(message: object): Promise<void> {
    await this.request('messages', {
      messaging_product: 'whatsapp',
      ...message,
    });
  }

  private async request<Result>(
    path: string,
    body: object | FormData,
  ): Promise<Result> {
    const { accessToken, graphVersion, phoneNumberId } = readConfig();
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body instanceof FormData
            ? {}
            : { 'Content-Type': 'application/json' }),
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Graph API ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as Result;
  }
}
