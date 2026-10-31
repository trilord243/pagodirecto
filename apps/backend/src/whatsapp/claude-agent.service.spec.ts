import type Anthropic from '@anthropic-ai/sdk';
import { AgentToolError } from '../restaurants/agent-tools.service.js';
import { ESCALATION_TOOL } from './agent-definition.js';
import { ClaudeAgentService } from './claude-agent.service.js';

function fakeClient(streamed: unknown[]) {
  const send = vi.fn();
  const stream = {
    controller: new AbortController(),
    async *[Symbol.asyncIterator]() {
      yield* streamed;
    },
  };
  const client = {
    beta: {
      sessions: { events: { send, stream: vi.fn().mockResolvedValue(stream) } },
    },
  };
  return { client: client as unknown as Anthropic, send };
}

const idle = (type: string) => ({
  type: 'session.status_idle',
  stop_reason: { type },
});
const message = (text: string) => ({
  type: 'agent.message',
  content: [{ type: 'text', text }],
});
const toolUse = (name: string, input: Record<string, unknown> = {}) => ({
  type: 'agent.custom_tool_use',
  id: 'sevt_1',
  name,
  input,
});

describe('ClaudeAgentService', () => {
  const executeTool = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('devuelve solo el ultimo mensaje del agente', async () => {
    const { client } = fakeClient([
      message('Revisando...'),
      message('Hola, ¿en que te ayudo?'),
      idle('end_turn'),
    ]);

    const result = await new ClaudeAgentService(client).runTurn(
      's',
      'hola',
      executeTool,
    );

    expect(result).toEqual({
      reply: 'Hola, ¿en que te ayudo?',
      stopReason: 'end_turn',
      escalation: undefined,
    });
  });

  it('resuelve la escalacion y sigue hasta el fin del turno', async () => {
    const { client, send } = fakeClient([
      toolUse(ESCALATION_TOOL, { motivo: 'quiere cotizar' }),
      idle('requires_action'),
      message('Un asesor te va a escribir.'),
      idle('end_turn'),
    ]);

    const result = await new ClaudeAgentService(client).runTurn(
      's',
      'precio',
      executeTool,
    );

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.escalation).toBe('quiere cotizar');
    expect(result.reply).toBe('Un asesor te va a escribir.');
    expect(send.mock.calls[1][1].events[0]).toMatchObject({
      type: 'user.custom_tool_result',
      custom_tool_use_id: 'sevt_1',
      is_error: false,
    });
  });

  it('devuelve al agente el resultado de una herramienta', async () => {
    executeTool.mockResolvedValue('{"pedido":7}');
    const { client, send } = fakeClient([
      toolUse('crear_pedido', { restaurante: 'arepera' }),
      idle('end_turn'),
    ]);

    await new ClaudeAgentService(client).runTurn('s', 'si', executeTool);

    expect(executeTool).toHaveBeenCalledWith('crear_pedido', {
      restaurante: 'arepera',
    });
    expect(send.mock.calls[1][1].events[0]).toMatchObject({
      content: [{ type: 'text', text: '{"pedido":7}' }],
      is_error: false,
    });
  });

  it('muestra al agente los errores previstos', async () => {
    executeTool.mockRejectedValue(new AgentToolError('Plato no disponible.'));
    const { client, send } = fakeClient([
      toolUse('crear_pedido'),
      idle('end_turn'),
    ]);

    await new ClaudeAgentService(client).runTurn('s', 'si', executeTool);

    expect(send.mock.calls[1][1].events[0]).toMatchObject({
      content: [{ type: 'text', text: 'Plato no disponible.' }],
      is_error: true,
    });
  });

  it('oculta al agente los errores internos', async () => {
    executeTool.mockRejectedValue(new Error('password de la base'));
    const { client, send } = fakeClient([
      toolUse('crear_pedido'),
      idle('end_turn'),
    ]);

    await new ClaudeAgentService(client).runTurn('s', 'si', executeTool);

    const result = send.mock.calls[1][1].events[0];
    expect(result.is_error).toBe(true);
    expect(result.content[0].text).not.toContain('password');
  });

  it('falla si el stream termina sin cerrar el turno', async () => {
    const { client } = fakeClient([message('a medias')]);

    await expect(
      new ClaudeAgentService(client).runTurn('s', 'hola', executeTool),
    ).rejects.toThrow('el turno no termino');
  });
});
