import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  MESSAGE_TOOLS,
  RestaurantAgentTools,
  SEND_OPTIONS_TOOL,
} from '../restaurants/agent-tools.service.js';
import { ClaudeAgentService, TurnResult } from './claude-agent.service.js';
import { ConversationStore } from './conversation.store.js';
import { OdooConversationService } from './odoo-conversation.service.js';
import { WhatsappApiService } from './whatsapp-api.service.js';
import { readConfig } from './whatsapp.config.js';
import { InboundMessage } from './whatsapp.webhook.js';

const HOUR_MS = 3_600_000;
const MAX_INPUT_LENGTH = 2000;
const MAX_REMEMBERED_MESSAGES = 1000;

export const TEXT_ONLY_MESSAGE =
  'Por ahora solo puedo leer mensajes de texto. ¿Me lo escribes, por favor?';
export const FALLBACK_MESSAGE =
  'Tuve un problema para responderte. Intenta de nuevo en unos minutos, por favor.';
export const HANDOFF_MESSAGE =
  'Por ahora no puedo seguir atendiéndote por aquí. Escríbeme de nuevo más tarde, por favor.';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly queues = new Map<string, Promise<void>>();
  private readonly seenMessages = new Set<string>();
  private readonly recentMessages = new Map<string, number[]>();

  constructor(
    private readonly agent: ClaudeAgentService,
    private readonly odoo: OdooConversationService,
    private readonly store: ConversationStore,
    private readonly tools: RestaurantAgentTools,
    private readonly whatsapp: WhatsappApiService,
  ) {}

  // Meta reintenta si tarda la respuesta, asi que el webhook contesta de
  // inmediato y el turno corre aparte, uno a la vez por cliente.
  enqueue(message: InboundMessage): Promise<void> {
    if (this.seenMessages.has(message.id)) {
      return Promise.resolve();
    }
    this.seenMessages.add(message.id);
    if (this.seenMessages.size > MAX_REMEMBERED_MESSAGES) {
      this.seenMessages.delete(this.seenMessages.values().next().value!);
    }

    const key = conversationKey(message.from);
    const { allowAllNumbers, allowedNumbers } = readConfig();
    if (!allowAllNumbers && !allowedNumbers.has(message.from)) {
      this.logger.warn(`Numero fuera de la lista: ${key}`);
      return Promise.resolve();
    }

    const turn = (this.queues.get(key) ?? Promise.resolve())
      .then(() => this.handle(key, message))
      .catch((error: unknown) =>
        this.logger.error(`Conversacion ${key}: ${String(error)}`),
      )
      .finally(() => {
        if (this.queues.get(key) === turn) {
          this.queues.delete(key);
        }
      });
    this.queues.set(key, turn);
    return turn;
  }

  private async handle(key: string, message: InboundMessage): Promise<void> {
    if (message.type === 'reaction') {
      return;
    }
    const conversation = this.store.get(key);
    if ((conversation.handoffUntil ?? 0) > Date.now()) {
      return;
    }
    // Si Odoo no responde, el error corta aqui: mejor callar que pisar a un
    // asesor que esta atendiendo.
    if (
      readConfig().odooGuard &&
      !(await this.odoo.canAgentReply(message.from))
    ) {
      this.logger.log(`Conversacion ${key}: la atiende una persona`);
      return;
    }
    if (message.type !== 'text' || !message.text) {
      await this.whatsapp.sendText(message.from, TEXT_ONLY_MESSAGE);
      return;
    }
    if (this.isRateLimited(key)) {
      this.startHandoff(key, 'limite de mensajes por hora');
      await this.whatsapp.sendText(message.from, HANDOFF_MESSAGE);
      return;
    }

    let result: TurnResult;
    let delivered = false;
    let awaitingChoice = false;
    try {
      const sessionId =
        conversation.sessionId ??
        (await this.agent.createSession(`WhatsApp ${key}`));
      this.store.set(key, { sessionId });
      result = await this.agent.runTurn(
        sessionId,
        message.text.slice(0, MAX_INPUT_LENGTH),
        async (name, input) => {
          const output = await this.tools.execute(message.from, name, input);
          delivered ||= MESSAGE_TOOLS.has(name);
          awaitingChoice = name === SEND_OPTIONS_TOOL;
          return output;
        },
      );
    } catch (error) {
      // Una sesion a medio turno no acepta mensajes nuevos: se descarta.
      this.logger.error(`Conversacion ${key}: ${String(error)}`);
      this.store.set(key, {});
      await this.whatsapp.sendText(message.from, FALLBACK_MESSAGE);
      return;
    }

    if (result.stopReason === 'budget_reached') {
      this.startHandoff(key, 'presupuesto de la sesion agotado');
      await this.whatsapp.sendText(message.from, HANDOFF_MESSAGE);
      return;
    }
    if (result.stopReason !== 'end_turn') {
      this.logger.error(`Conversacion ${key}: ${result.stopReason}`);
      this.store.set(key, {});
      await this.whatsapp.sendText(message.from, FALLBACK_MESSAGE);
      return;
    }
    if (result.escalation !== undefined) {
      this.startHandoff(key, result.escalation);
    }
    // Las opciones ya llevan su mensaje: un texto despues llegaria debajo de los
    // botones repitiendolo. Y sin texto es normal si ya se le envio algo.
    if (awaitingChoice || (!result.reply && delivered)) {
      return;
    }
    await this.whatsapp.sendText(
      message.from,
      result.reply ||
        (result.escalation === undefined ? FALLBACK_MESSAGE : HANDOFF_MESSAGE),
    );
  }

  private startHandoff(key: string, reason: string): void {
    const { sessionId } = this.store.get(key);
    const handoffUntil = Date.now() + readConfig().handoffHours * HOUR_MS;
    this.store.set(key, { sessionId, handoffUntil });
    this.logger.warn(`Pase a asesor ${key}: ${reason}`);
  }

  private isRateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (this.recentMessages.get(key) ?? []).filter(
      (timestamp) => now - timestamp < HOUR_MS,
    );
    recent.push(now);
    this.recentMessages.set(key, recent);
    return recent.length > readConfig().maxMessagesPerHour;
  }
}

// El numero del cliente no sale del VPS ni queda en los logs.
export function conversationKey(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 16);
}
