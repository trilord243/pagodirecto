import { Injectable } from '@nestjs/common';
import { readConfig } from './whatsapp.config.js';

const MAX_MESSAGE_LENGTH = 4096;

@Injectable()
export class WhatsappApiService {
  async sendText(to: string, body: string): Promise<void> {
    const { accessToken, graphVersion, phoneNumberId } = readConfig();
    for (let start = 0; start < body.length; start += MAX_MESSAGE_LENGTH) {
      const response = await fetch(
        `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: body.slice(start, start + MAX_MESSAGE_LENGTH) },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Graph API ${response.status}: ${await response.text()}`,
        );
      }
    }
  }
}
