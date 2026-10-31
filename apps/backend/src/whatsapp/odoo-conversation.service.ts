import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { readConfig } from './whatsapp.config.js';

// Odoo guarda +58... en whatsapp_message y 58... en discuss_channel. Los
// mensajes salientes de Odoo son de asesores: lo que contesta Claude sale
// directo por Graph API y no queda en esa tabla.
const CONVERSATION_QUERY = `
  select
    (select c.stv_bot_state
       from discuss_channel c
      where c.channel_type = 'whatsapp'
        and regexp_replace(c.whatsapp_number, '\\D', '', 'g') = $1
      order by c.write_date desc
      limit 1) as state,
    exists(select 1
       from whatsapp_message m
      where m.message_type = 'outbound'
        and regexp_replace(m.mobile_number, '\\D', '', 'g') = $1
        and m.create_date > (now() at time zone 'utc') - make_interval(hours => $2)
    ) as recent_outbound`;

export interface OdooConversation {
  state: string | null;
  recentOutbound: boolean;
}

export function agentMayReply({
  state,
  recentOutbound,
}: OdooConversation): boolean {
  switch (state ?? 'new') {
    case 'new':
    case 'waiting_agent':
      return true;
    // Con el bot de Odoo apagado nadie procesa la encuesta, asi que un chat en
    // 'survey' tambien vuelve a Claude pasada la ventana del asesor.
    case 'human':
    case 'survey':
      return !recentOutbound;
    default:
      // 'off' lo apago un asesor a proposito.
      return false;
  }
}

@Injectable()
export class OdooConversationService implements OnModuleDestroy {
  private readonly logger = new Logger(OdooConversationService.name);
  private readonly pool = new pg.Pool({
    host: readConfig().odooDbHost,
    database: readConfig().odooDbName,
    user: readConfig().odooDbUser,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });

  constructor() {
    this.pool.on('error', (error) =>
      this.logger.error(`Postgres: ${error.message}`),
    );
  }

  async canAgentReply(phone: string): Promise<boolean> {
    const { rows } = await this.pool.query<{
      state: string | null;
      recent_outbound: boolean;
    }>(CONVERSATION_QUERY, [phone, readConfig().humanHours]);
    return agentMayReply({
      state: rows[0].state,
      recentOutbound: rows[0].recent_outbound,
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }
}
