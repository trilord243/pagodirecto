import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import pg from 'pg';
import { SCHEMA } from './schema.js';

const DEFAULT_DATABASE_URL =
  'socket:/var/run/postgresql?db=pagodirecto&user=pagodirecto';

export interface Queryable {
  query<Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

@Injectable()
export class DatabaseService
  implements Queryable, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });

  constructor() {
    this.pool.on('error', (error) =>
      this.logger.error(`Postgres: ${error.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }

  async query<Row>(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: Row[] }> {
    const { rows } = await this.pool.query(text, params);
    return { rows: rows as Row[] };
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work({
        query: async <Row>(text: string, params: unknown[] = []) => {
          const { rows } = await client.query(text, params);
          return { rows: rows as Row[] };
        },
      });
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
