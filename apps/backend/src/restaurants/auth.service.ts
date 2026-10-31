import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { restaurantPublicId } from './restaurant-id.js';

const SESSION_DAYS = 7;
// Sin esto, un usuario inexistente responderia mas rapido que uno real.
const DECOY_HASH = hashPassword('usuario-inexistente');
const RESTAURANT_COLUMNS =
  'r.id, r.public_id as "restaurantId", r.name, r.username, r.currency';

export interface Restaurant {
  id: number;
  restaurantId: string;
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
      `select ${RESTAURANT_COLUMNS}, r.password_hash
         from restaurants r
        where r.username = $1 and r.active`,
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

    const { password_hash: _passwordHash, ...restaurant } = row;
    return { token: await this.createSession(restaurant.id), restaurant };
  }

  // Afiliacion abierta, sin verificacion. El comercio entra de una vez, y le
  // aparece a los clientes cuando publique su menu.
  async register(
    username: string,
    password: string,
  ): Promise<{ token: string; restaurant: Restaurant }> {
    const { rows } = await this.db.query<Restaurant>(
      `insert into restaurants (public_id, name, username, password_hash)
       values ($1, $2, $2, $3)
       on conflict do nothing
       returning id, public_id as "restaurantId", name, username, currency`,
      [restaurantPublicId(username), username, await hashPassword(password)],
    );
    const restaurant = rows[0];
    if (!restaurant) {
      throw new ConflictException('Ese usuario ya existe');
    }
    return { token: await this.createSession(restaurant.id), restaurant };
  }

  private async createSession(restaurantId: number): Promise<string> {
    await this.db.query(
      'delete from restaurant_sessions where expires_at < now()',
    );
    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      `insert into restaurant_sessions (token_hash, restaurant_id, expires_at)
       values ($1, $2, now() + make_interval(days => $3))`,
      [hashToken(token), restaurantId, SESSION_DAYS],
    );
    return token;
  }

  async logout(token: string): Promise<void> {
    await this.db.query('delete from restaurant_sessions where token_hash = $1', [
      hashToken(token),
    ]);
  }

  async authenticate(token: string): Promise<Restaurant | null> {
    const { rows } = await this.db.query<Restaurant>(
      `select ${RESTAURANT_COLUMNS}
         from restaurant_sessions s
         join restaurants r on r.id = s.restaurant_id
        where s.token_hash = $1 and s.expires_at > now() and r.active`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  }
}
