import { PGlite } from '@electric-sql/pglite';
import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService, Queryable } from '../database/database.service.js';
import { SCHEMA } from '../database/schema.js';
import type { Restaurant } from './auth.service.js';
import { IqService } from './iq.service.js';

function restaurant(id: number, overrides = {}): Restaurant {
  return {
    id,
    restaurantId: `PD-${id}`,
    name: `Comercio ${id}`,
    username: `c${id}`,
    currency: 'USD',
    insightsEnabled: true,
    ...overrides,
  };
}

describe('PagoDirecto IQ', () => {
  let lite: PGlite;
  let iq: IqService;

  async function addRestaurant(id: number, currency = 'USD') {
    await lite.query(
      `insert into restaurants (public_id, name, username, password_hash, currency)
       values ($1, $2, $3, 'x', $4)`,
      [`PD-${id}`, `Comercio ${id}`, `c${id}`, currency],
    );
  }

  async function addOrder(
    restaurantId: number,
    phone: string,
    total: number,
    daysAgo = 1,
    status = 'pending',
  ) {
    await lite.query(
      `insert into orders
         (restaurant_id, customer_phone, customer_name, subtotal, total,
          currency, status, created_at)
       values ($1, $2, 'Secreto', $3, $3, 'USD', $4,
               now() - make_interval(days => $5))`,
      [restaurantId, phone, total, status, daysAgo],
    );
  }

  beforeEach(async () => {
    lite = new PGlite();
    await lite.exec(SCHEMA);
    const db: Queryable = {
      query: async <Row>(text: string, params: unknown[] = []) => {
        const { rows } = await lite.query<Row>(text, params as never[]);
        return { rows };
      },
    };
    iq = new IqService(db as DatabaseService);
    await addRestaurant(1);
  });

  afterEach(() => lite.close());

  it('sin el plan no entrega datos reales', async () => {
    await expect(
      iq.dashboard(restaurant(1, { insightsEnabled: false }), 'real'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('la vista de ejemplo esta abierta y se identifica como tal', async () => {
    const dashboard = await iq.dashboard(
      restaurant(1, { insightsEnabled: false }),
      'demo',
    );

    expect(dashboard.source).toBe('demo');
    expect(dashboard.salesByDay).toHaveLength(30);
    expect(dashboard.summary.orders).toBeGreaterThan(0);
  });

  it('el ejemplo no cambia entre recargas ni entre modos por defecto', async () => {
    const first = await iq.dashboard(restaurant(1), 'demo');
    const second = await iq.dashboard(restaurant(1), undefined);

    expect(second).toEqual(first);
  });

  it('el ejemplo usa los platos del propio comercio', async () => {
    for (const [name, price] of [
      ['Arepa', 4],
      ['Cachapa', 6],
      ['Malta', 2],
    ] as const) {
      await lite.query(
        'insert into menu_items (restaurant_id, name, price) values (1, $1, $2)',
        [name, price],
      );
    }

    const { topItems } = await iq.dashboard(restaurant(1), 'demo');

    expect(topItems.map(({ name }) => name).sort()).toEqual([
      'Arepa',
      'Cachapa',
      'Malta',
    ]);
  });

  it('los datos reales excluyen cancelados y pedidos viejos', async () => {
    await addOrder(1, '1', 10);
    await addOrder(1, '1', 20);
    await addOrder(1, '2', 30);
    await addOrder(1, '3', 99, 1, 'cancelled');
    await addOrder(1, '4', 50, 40);

    const { source, summary, customers } = await iq.dashboard(
      restaurant(1),
      'real',
    );

    expect(source).toBe('real');
    expect(summary).toMatchObject({
      orders: 3,
      sales: 60,
      averageTicket: 20,
      customers: 2,
      cancelRate: 0.25,
    });
    expect(customers.returning).toBe(1);
  });

  it('compara con el periodo anterior', async () => {
    await addOrder(1, '1', 10);
    await addOrder(1, '1', 10);
    await addOrder(1, '2', 10, 40);

    const { summary } = await iq.dashboard(restaurant(1), 'real');

    expect(summary.ordersChange).toBe(100);
  });

  it('detecta frecuentes en riesgo', async () => {
    await addOrder(1, '1', 10, 25);
    await addOrder(1, '1', 10, 28);

    const { customers } = await iq.dashboard(restaurant(1), 'real');

    expect(customers.atRisk).toBe(1);
  });

  it('solo ve sus propias ventas', async () => {
    await addRestaurant(2);
    await addOrder(1, '1', 10);
    await addOrder(2, '2', 500);

    const { summary } = await iq.dashboard(restaurant(1), 'real');

    expect(summary.sales).toBe(10);
  });

  it('no expone telefonos ni nombres de clientes', async () => {
    await addOrder(1, '584120000000', 10);

    const dashboard = JSON.stringify(await iq.dashboard(restaurant(1), 'real'));

    expect(dashboard).not.toContain('584120000000');
    expect(dashboard).not.toContain('Secreto');
  });

  describe('comparacion con otros comercios', () => {
    async function addPeers(count: number, ordersEach = 5, extra = 0) {
      for (let id = 2; id < 2 + count; id++) {
        await addRestaurant(id);
        for (let i = 0; i < ordersEach; i++) {
          await addOrder(id, `${id}${i}`, 10 + id + (id === 2 ? extra : 0));
        }
      }
    }

    it('se apaga con menos de 5 comercios comparables', async () => {
      await addPeers(4);

      const { benchmark } = await iq.dashboard(restaurant(1), 'real');

      expect(benchmark.available).toBe(false);
      expect(benchmark.metrics).toEqual([]);
    });

    it('no cuenta comercios con muy pocos pedidos', async () => {
      await addPeers(5, 4);

      const { benchmark } = await iq.dashboard(restaurant(1), 'real');

      expect(benchmark.available).toBe(false);
    });

    it('se apaga si un comercio domina el grupo', async () => {
      await addPeers(5, 5, 300);

      const { benchmark } = await iq.dashboard(restaurant(1), 'real');

      expect(benchmark.available).toBe(false);
    });

    it('con grupo suficiente entrega la mediana sin identificar a nadie', async () => {
      await addOrder(1, '1', 10);
      await addPeers(6);

      const { benchmark } = await iq.dashboard(restaurant(1), 'real');

      expect(benchmark).toMatchObject({ available: true, peers: 6 });
      expect(benchmark.metrics[0]).toMatchObject({
        key: 'averageTicket',
        mine: 10,
        peers: 14.5,
      });
      expect(JSON.stringify(benchmark)).not.toContain('Comercio');
    });

    it('no se compara consigo mismo ni con otra moneda', async () => {
      await addPeers(5);
      await lite.query(`update restaurants set currency = 'VES' where id = 2`);

      const { benchmark } = await iq.dashboard(restaurant(1), 'real');

      expect(benchmark.available).toBe(false);
    });
  });
});
