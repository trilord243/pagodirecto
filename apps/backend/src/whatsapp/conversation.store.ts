import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { readConfig } from './whatsapp.config.js';

export interface Conversation {
  sessionId?: string;
  handoffUntil?: number;
}

@Injectable()
export class ConversationStore {
  private readonly path = readConfig().conversationsFile;
  private readonly conversations = new Map<string, Conversation>(this.load());

  get(key: string): Conversation {
    return this.conversations.get(key) ?? {};
  }

  set(key: string, conversation: Conversation): void {
    this.conversations.set(key, conversation);
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify(Object.fromEntries(this.conversations)),
      { mode: 0o600 },
    );
    renameSync(temporary, this.path);
  }

  private load(): [string, Conversation][] {
    if (!existsSync(this.path)) {
      return [];
    }
    return Object.entries(
      JSON.parse(readFileSync(this.path, 'utf8')) as Record<
        string,
        Conversation
      >,
    );
  }
}
