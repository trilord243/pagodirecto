import Anthropic from '@anthropic-ai/sdk';
import {
  AGENT_DEFINITION,
  ENVIRONMENT_DEFINITION,
} from './whatsapp/agent-definition.js';
import { readConfig } from './whatsapp/whatsapp.config.js';

// Se corre una vez, y otra cada vez que cambie la definicion del agente:
// sin CLAUDE_AGENT_ID crea el agente, con el publica una version nueva.
const client = new Anthropic();
const { agentId, environmentId } = readConfig();

if (agentId) {
  const { version } = await client.beta.agents.retrieve(agentId);
  const updated = await client.beta.agents.update(agentId, {
    version,
    ...AGENT_DEFINITION,
  });
  console.log(`Agente ${updated.id} actualizado a la version ${updated.version}`);
} else {
  const environment = environmentId
    ? { id: environmentId }
    : await client.beta.environments.create(ENVIRONMENT_DEFINITION);
  const agent = await client.beta.agents.create(AGENT_DEFINITION);
  console.log(`CLAUDE_ENVIRONMENT_ID=${environment.id}`);
  console.log(`CLAUDE_AGENT_ID=${agent.id}`);
}
