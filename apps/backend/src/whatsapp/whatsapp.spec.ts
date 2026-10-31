import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ClaudeAgentService,
  TurnResult,
} from './claude-agent.service.js';
import {
  ConversationService,
  FALLBACK_MESSAGE,
  HANDOFF_MESSAGE,
  TEXT_ONLY_MESSAGE,
  conversationKey,
} from './conversation.service.js';
import { Conversation, ConversationStore } from './conversation.store.js';
import { RestaurantAgentTools } from '../restaurants/agent-tools.service.js';
import {
  OdooConversationService,
  agentMayReply,
} from './odoo-conversation.service.js';
import { WhatsappApiService } from './whatsapp-api.service.js';
import { WhatsappController } from './whatsapp.controller.js';
import { isValidSignature } from './whatsapp.webhook.js';

const CUSTOMER = '584120000000';
const SECRET = 'secreto-de-prueba';

function memoryStore() {
  const conversations = new Map<string, Conversation>();
  return {
    get: (key: string) => conversations.get(key) ?? {},
    set: (key: string, value: Conversation) => conversations.set(key, value),
  };
}

function textMessage(id: string, text = 'hola') {
  return { id, from: CUSTOMER, type: 'text', text };
}

describe('whatsapp', () => {
  let app: INestApplication;
  let conversations: ConversationService;
  let store: ReturnType<typeof memoryStore>;
  const sendText = vi.fn();
  const createSession = vi.fn();
  const runTurn = vi.fn<() => Promise<TurnResult>>();
  const canAgentReply = vi.fn<() => Promise<boolean>>();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'token-de-verificacion');
    vi.stubEnv('WHATSAPP_APP_SECRET', SECRET);
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '111');
    vi.stubEnv('WHATSAPP_ALLOWED_NUMBERS', CUSTOMER);
    vi.stubEnv('WHATSAPP_MAX_MESSAGES_PER_HOUR', '2');
    createSession.mockResolvedValue('sesn_1');
    runTurn.mockResolvedValue({ reply: 'Hola', stopReason: 'end_turn' });
    canAgentReply.mockResolvedValue(true);
    store = memoryStore();

    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        ConversationService,
        { provide: ConversationStore, useValue: store },
        { provide: OdooConversationService, useValue: { canAgentReply } },
        { provide: RestaurantAgentTools, useValue: { execute: vi.fn() } },
        { provide: WhatsappApiService, useValue: { sendText } },
        {
          provide: ClaudeAgentService,
          useValue: { createSession, runTurn },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    conversations = app.get(ConversationService);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  describe('webhook', () => {
    it('devuelve el challenge solo con el token correcto', async () => {
      await request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'token-de-verificacion',
          'hub.challenge': '12345',
        })
        .expect(200, '12345');

      await request(app.getHttpServer())
        .get('/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'otro',
          'hub.challenge': '12345',
        })
        .expect(403);
    });

    function payload(phoneNumberId = '111') {
      return JSON.stringify({
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  messages: [textMessage('wamid.1')].map((message) => ({
                    ...message,
                    text: { body: message.text },
                  })),
                },
              },
            ],
          },
        ],
      });
    }

    function sign(body: string) {
      return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
    }

    it('rechaza un POST sin firma valida y no lo procesa', async () => {
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', 'sha256=falsa')
        .send(payload())
        .expect(403);

      expect(runTurn).not.toHaveBeenCalled();
    });

    it('procesa un POST firmado', async () => {
      const body = payload();
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', sign(body))
        .send(body)
        .expect(200);

      await vi.waitFor(() =>
        expect(sendText).toHaveBeenCalledWith(CUSTOMER, 'Hola'),
      );
    });

    it('ignora mensajes dirigidos a otro numero de la app', async () => {
      const body = payload('999');
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', sign(body))
        .send(body)
        .expect(200);

      expect(runTurn).not.toHaveBeenCalled();
    });

    it('falla cerrado si no hay app secret configurado', () => {
      expect(isValidSignature(Buffer.from('{}'), 'sha256=x', '')).toBe(false);
    });
  });

  describe('agentMayReply', () => {
    it.each([
      [null, false, true],
      ['new', false, true],
      ['waiting_agent', false, true],
      ['human', false, true],
      ['human', true, false],
      ['survey', false, true],
      ['survey', true, false],
      ['off', false, false],
    ])('estado %s, asesor reciente %s => %s', (state, recentOutbound, expected) => {
      expect(agentMayReply({ state, recentOutbound })).toBe(expected);
    });
  });

  describe('conversacion', () => {
    it('reutiliza la sesion del cliente entre mensajes', async () => {
      await conversations.enqueue(textMessage('wamid.1'));
      await conversations.enqueue(textMessage('wamid.2'));

      expect(createSession).toHaveBeenCalledTimes(1);
      expect(runTurn).toHaveBeenCalledTimes(2);
    });

    it('no repite un mensaje reenviado por Meta', async () => {
      await conversations.enqueue(textMessage('wamid.1'));
      await conversations.enqueue(textMessage('wamid.1'));

      expect(runTurn).toHaveBeenCalledTimes(1);
    });

    it('no llama a Claude para numeros fuera de la lista', async () => {
      await conversations.enqueue({
        ...textMessage('wamid.1'),
        from: '584149999999',
      });

      expect(createSession).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('con * atiende a cualquier numero', async () => {
      vi.stubEnv('WHATSAPP_ALLOWED_NUMBERS', '*');

      await conversations.enqueue({
        ...textMessage('wamid.1'),
        from: '584149999999',
      });

      expect(sendText).toHaveBeenCalledWith('584149999999', 'Hola');
    });

    it('no interviene si Odoo dice que atiende una persona', async () => {
      canAgentReply.mockResolvedValue(false);

      await conversations.enqueue(textMessage('wamid.1'));

      expect(runTurn).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('calla si no puede leer el estado en Odoo', async () => {
      canAgentReply.mockRejectedValue(new Error('sin base de datos'));

      await conversations.enqueue(textMessage('wamid.1'));

      expect(runTurn).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });

    it('ignora las reacciones', async () => {
      await conversations.enqueue({
        id: 'wamid.1',
        from: CUSTOMER,
        type: 'reaction',
      });

      expect(sendText).not.toHaveBeenCalled();
    });

    it('el titulo de la sesion no lleva el numero', async () => {
      await conversations.enqueue(textMessage('wamid.1'));

      expect(createSession.mock.calls[0][0]).not.toContain(CUSTOMER);
    });

    it('responde sin Claude a lo que no es texto', async () => {
      await conversations.enqueue({
        id: 'wamid.1',
        from: CUSTOMER,
        type: 'audio',
      });

      expect(runTurn).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledWith(CUSTOMER, TEXT_ONLY_MESSAGE);
    });

    it('se calla tras pasar a un asesor', async () => {
      runTurn.mockResolvedValueOnce({
        reply: 'Un asesor te escribira',
        stopReason: 'end_turn',
        escalation: 'quiere cotizar',
      });

      await conversations.enqueue(textMessage('wamid.1'));
      await conversations.enqueue(textMessage('wamid.2'));

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(runTurn).toHaveBeenCalledTimes(1);
    });

    it('pasa a un asesor al superar el limite por hora', async () => {
      await conversations.enqueue(textMessage('wamid.1'));
      await conversations.enqueue(textMessage('wamid.2'));
      await conversations.enqueue(textMessage('wamid.3'));

      expect(runTurn).toHaveBeenCalledTimes(2);
      expect(sendText).toHaveBeenLastCalledWith(CUSTOMER, HANDOFF_MESSAGE);
    });

    it('pasa a un asesor al agotar el presupuesto', async () => {
      runTurn.mockResolvedValueOnce({
        reply: '',
        stopReason: 'budget_reached',
      });

      await conversations.enqueue(textMessage('wamid.1'));

      expect(sendText).toHaveBeenCalledWith(CUSTOMER, HANDOFF_MESSAGE);
    });

    it('descarta la sesion si el turno falla', async () => {
      runTurn.mockRejectedValueOnce(new Error('sin conexion'));

      await conversations.enqueue(textMessage('wamid.1'));

      expect(sendText).toHaveBeenCalledWith(CUSTOMER, FALLBACK_MESSAGE);
      expect(store.get(conversationKey(CUSTOMER)).sessionId).toBeUndefined();
    });
  });
});
