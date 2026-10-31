import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { hashPassword, verifyPassword } from './passwords.js';

const SESSION_DAYS = 7;
// Sin esto, un usuario inexistente responderia mas rapido que uno real.
const DECOY_HASH = hashPassword('usuario-inexistente');

export interface Restaurant {
  id: number;
  slug: string;
  name: string;
  username: string;
  currency: string;
}

interface RestaurantWithPassword extends Restaurant {
  password_hash: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; restaurant: Restaurant }> {
    const { rows } = await this.db.query<RestaurantWithPassword>(
      `select id, slug, name, username, currency, password_hash
         from restaurants
        where username = $1 and active`,
      [username],
    );
    const row = rows[0];
    const valid = await verifyPassword(
      password,
      row?.password_hash ?? (await DECOY_HASH),
    );
    if (!row || !valid) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    await this.db.query(
      'delete from restaurant_sessions where expires_at < now()',
    );
    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      `insert into restaurant_sessions (token_hash, restaurant_id, expires_at)
       values ($1, $2, now() + make_interval(days => $3))`,
      [hashToken(token), row.id, SESSION_DAYS],
    );

    const { password_hash: _passwordHash, ...restaurant } = row;
    return { token, restaurant };
  }

  async logout(token: string): Promise<void> {
    await this.db.query('delete from restaurant_sessions where token_hash = $1', [
      hashToken(token),
    ]);
  }

  async authenticate(token: string): Promise<Restaurant | null> {
    const { rows } = await this.db.query<Restaurant>(
      `select r.id, r.slug, r.name, r.username, r.currency
         from restaurant_sessions s
         join restaurants r on r.id = s.restaurant_id
        where s.token_hash = $1 and s.expires_at > now() and r.active`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  }
}
