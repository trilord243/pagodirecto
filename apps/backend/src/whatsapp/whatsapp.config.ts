export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
    appSecret: env.WHATSAPP_APP_SECRET ?? '',
    accessToken: env.WHATSAPP_ACCESS_TOKEN ?? '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    graphVersion: env.WHATSAPP_GRAPH_VERSION ?? 'v24.0',
    allowAllNumbers: (env.WHATSAPP_ALLOWED_NUMBERS ?? '').trim() === '*',
    // Lista cerrada: un numero que no este aqui no llega nunca a Claude.
    allowedNumbers: new Set(
      (env.WHATSAPP_ALLOWED_NUMBERS ?? '')
        .split(',')
        .map((number) => number.replace(/\D/g, ''))
        .filter(Boolean),
    ),
    maxMessagesPerHour: Number(env.WHATSAPP_MAX_MESSAGES_PER_HOUR ?? 30),
    handoffHours: Number(env.WHATSAPP_HANDOFF_HOURS ?? 12),
    // Horas que Claude se abstiene tras el ultimo mensaje de un asesor.
    humanHours: Number(env.WHATSAPP_HUMAN_HOURS ?? 12),
    odooDbHost: env.ODOO_DB_HOST ?? '/var/run/postgresql',
    odooDbName: env.ODOO_DB_NAME ?? 'odoo',
    odooDbUser: env.ODOO_DB_USER ?? 'pagodirecto',
    conversationsFile:
      env.WHATSAPP_CONVERSATIONS_FILE ?? 'data/conversations.json',
    agentId: env.CLAUDE_AGENT_ID ?? '',
    environmentId: env.CLAUDE_ENVIRONMENT_ID ?? '',
    sessionBudgetCents: env.CLAUDE_SESSION_BUDGET_CENTS ?? '100',
  };
}
