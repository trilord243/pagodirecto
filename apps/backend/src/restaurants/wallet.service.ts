import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.service.js';

// Wallet de prueba: saldo simulado por telefono y moneda. No mueve dinero real
// ni liquida nada al comercio; el dia que exista el wallet real de PagoDirecto,
// este servicio es lo que se reemplaza.
@Injectable()
export class WalletService {
  constructor(private readonly db: DatabaseService) {}

  async balance(
    db: Queryable,
    phone: string,
    currency: string,
  ): Promise<number> {
    const { rows } = await db.query<{ balance: number }>(
      `select balance::float8 as balance from wallets
        where customer_phone = $1 and currency = $2`,
      [phone, currency],
    );
    return rows[0]?.balance ?? 0;
  }

  async balances(phone: string) {
    const { rows } = await this.db.query(
      `select currency as moneda, balance::float8 as saldo from wallets
        where customer_phone = $1
        order by currency`,
      [phone],
    );
    return rows;
  }

  // El where hace el cobro atomico: si no alcanza no toca nada y devuelve null.
  async charge(
    db: Queryable,
    phone: string,
    currency: string,
    amount: number,
    orderId: number,
  ): Promise<number | null> {
    const { rows } = await db.query<{ balance: number }>(
      `update wallets
          set balance = balance - $3, updated_at = now()
        where customer_phone = $1 and currency = $2 and balance >= $3
        returning balance::float8 as balance`,
      [phone, currency, amount],
    );
    if (!rows[0]) {
      return null;
    }
    await this.record(db, phone, currency, -amount, 'order_payment', orderId);
    return rows[0].balance;
  }

  async credit(
    db: Queryable,
    phone: string,
    currency: string,
    amount: number,
    kind: 'topup' | 'refund',
    orderId: number | null = null,
  ): Promise<number> {
    const { rows } = await db.query<{ balance: number }>(
      `insert into wallets (customer_phone, currency, balance)
       values ($1, $2, $3)
       on conflict (customer_phone, currency) do update
         set balance = wallets.balance + excluded.balance, updated_at = now()
       returning balance::float8 as balance`,
      [phone, currency, amount],
    );
    await this.record(db, phone, currency, amount, kind, orderId);
    return rows[0].balance;
  }

  private record(
    db: Queryable,
    phone: string,
    currency: string,
    amount: number,
    kind: string,
    orderId: number | null,
  ) {
    return db.query(
      `insert into wallet_transactions
         (customer_phone, currency, amount, kind, order_id)
       values ($1, $2, $3, $4, $5)`,
      [phone, currency, amount, kind, orderId],
    );
  }
}
