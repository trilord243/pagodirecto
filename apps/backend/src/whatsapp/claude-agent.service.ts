import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentToolError } from '../restaurants/agent-tools.service.js';
import { ESCALATION_TOOL } from './agent-definition.js';
import { readConfig } from './whatsapp.config.js';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

const TURN_TIMEOUT_MS = 120_000;

export interface TurnResult {
  reply: string;
  stopReason: string;
  escalation?: string;
}

export type ToolExecutor = (
  name: string,
  input: Record<string, unknown>,
) => Promise<string>;

@Injectable()
export class ClaudeAgentService {
  private readonly logger = new Logger(ClaudeAgentService.name);

  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic) {}

  async createSession(title: string): Promise<string> {
    const { agentId, environmentId, sessionBudgetCents } = readConfig();
    const session = await this.client.beta.sessions.create({
      agent: agentId,
      environment_id: environmentId,
      title,
      budget: {
        type: 'limit',
        max_list_cost: { amount: sessionBudgetCents, currency: 'USD' },
      },
    });
    return session.id;
  }

  async runTurn(
    sessionId: string,
    text: string,
    executeTool: ToolExecutor,
  ): Promise<TurnResult> {
    const stream = await this.client.beta.sessions.events.stream(sessionId);
    const deadline = setTimeout(
      () => stream.controller.abort(),
      TURN_TIMEOUT_MS,
    );
    let reply = '';
    let escalation: string | undefined;

    try {
      await this.client.beta.sessions.events.send(sessionId, {
        events: [{ type: 'user.message', content: [{ type: 'text', text }] }],
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'agent.message':
            // Se queda el ultimo: lo que el agente diga antes de una
            // herramienta es avance interno, no respuesta para el cliente.
            reply = event.content
              .flatMap((block) => (block.type === 'text' ? [block.text] : []))
              .join('\n\n');
            break;
          case 'agent.custom_tool_use': {
            if (event.name === ESCALATION_TOOL) {
              escalation = String(event.input.motivo ?? '');
            }
            const result = await this.runTool(event, executeTool);
            await this.client.beta.sessions.events.send(sessionId, {
              events: [
                {
                  type: 'user.custom_tool_result',
                  custom_tool_use_id: event.id,
                  content: [{ type: 'text', text: result.text }],
                  is_error: result.isError,
                },
              ],
            });
            break;
          }
          case 'session.error':
            this.logger.error(`Sesion ${sessionId}: ${event.error.type}`);
            break;
          case 'session.status_idle':
            if (event.stop_reason.type !== 'requires_action') {
              return { reply, stopReason: event.stop_reason.type, escalation };
            }
            break;
          case 'session.status_terminated':
            return { reply, stopReason: 'terminated', escalation };
        }
      }
      throw new Error(`Sesion ${sessionId}: el turno no termino`);
    } finally {
      clearTimeout(deadline);
      stream.controller.abort();
    }
  }

  private async runTool(
    event: { name: string; input: Record<string, unknown> },
    executeTool: ToolExecutor,
  ): Promise<{ text: string; isError: boolean }> {
    if (event.name === ESCALATION_TOOL) {
      return { text: 'Conversacion pasada a un asesor.', isError: false };
    }
    try {
      return {
        text: await executeTool(event.name, event.input),
        isError: false,
      };
    } catch (error) {
      if (error instanceof AgentToolError) {
        return { text: error.message, isError: true };
      }
      this.logger.error(`Herramienta ${event.name}: ${String(error)}`);
      return {
        text: 'No se pudo completar la operacion. Intenta de nuevo.',
        isError: true,
      };
    }
  }
}
