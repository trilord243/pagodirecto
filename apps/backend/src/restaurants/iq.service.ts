import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Restaurant } from './auth.service.js';

const PERIOD_DAYS = 30;
const TIMEZONE = 'America/Caracas';
// Quien ya repitio y lleva este tiempo sin pedir se considera en riesgo.
const AT_RISK_DAYS = 21;
const FREQUENT_ORDERS = 4;
// Sin pedidos suficientes una mediana delataria a un comercio concreto.
const MIN_PEERS = 5;
const MIN_PEER_ORDERS = 5;
const MAX_PEER_SHARE = 0.3;
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DEMO_DISHES = [
  { name: 'Plato estrella', price: 9 },
  { name: 'Combo del día', price: 7 },
  { name: 'Entrada de la casa', price: 4 },
  { name: 'Postre', price: 3.5 },
  { name: 'Bebida', price: 2 },
  { name: 'Especial del chef', price: 12 },
];

export interface Benchmark {
  available: boolean;
  reason: string | null;
  peers: number;
  metrics: {
    key: string;
    label: string;
    mine: number;
    peers: number;
    unit: 'money' | 'number' | 'percent';
  }[];
}

export interface IqDashboard {
  source: 'real' | 'demo';
  currency: string;
  periodDays: number;
  summary: {
    orders: number;
    sales: number;
    averageTicket: number;
    customers: number;
    repeatRate: number;
    cancelRate: number;
    ordersChange: number | null;
    salesChange: number | null;
  };
  salesByDay: { date: string; orders: number; sales: number }[];
  ordersByWeekday: { day: string; orders: number }[];
  ordersByHour: { hour: number; orders: number }[];
  topItems: { name: string; units: number; sales: number }[];
  unsoldItems: string[];
  customers: {
    new: number;
    returning: number;
    frequent: number;
    atRisk: number;
    rewardsPending: number;
  };
  benchmark: Benchmark;
}

function percentChange(current: number, previous: number): number | null {
  return previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;
}

const round = (value: number) => Math.round(value * 100) / 100;

// Mismo comercio, misma vista de ejemplo: asi no cambia en cada recarga.
function seededRandom(seed: number) {
  let state = seed * 2654435761 + 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function dayKey(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class IqService {
  constructor(private readonly db: DatabaseService) {}

  async dashboard(
    restaurant: Restaurant,
    mode: string | undefined,
  ): Promise<IqDashboard> {
    if (mode === 'real') {
      if (!restaurant.insightsEnabled) {
        throw new ForbiddenException(
          'PagoDirecto IQ es un plan que aún no tienes activo.',
        );
      }
      return this.real(restaurant);
    }
    return this.demo(restaurant);
  }

  private async real(restaurant: Restaurant): Promise<IqDashboard> {
    const id = restaurant.id;
    const query = async <Row>(text: string, params: unknown[] = [id]) =>
      (await this.db.query<Row>(text, params)).rows;
    const inPeriod = `restaurant_id = $1 and status <> 'cancelled'
      and created_at > now() - make_interval(days => ${PERIOD_DAYS})`;

    const [[totals], [previous], [cancelled], days, weekdays, hours] =
      await Promise.all([
        query<{
          orders: number;
          sales: number;
          customers: number;
          repeat_rate: number;
        }>(
          `with buyers as (
             select customer_phone, count(*) as orders, sum(total) as sales
               from orders where ${inPeriod}
              group by customer_phone)
           select coalesce(sum(orders), 0)::int as orders,
                  coalesce(sum(sales), 0)::float8 as sales,
                  count(*)::int as customers,
                  coalesce(count(*) filter (where orders > 1)::float8
                           / nullif(count(*), 0), 0) as repeat_rate
             from buyers`,
        ),
        query<{ orders: number; sales: number }>(
          `select count(*)::int as orders,
                  coalesce(sum(total), 0)::float8 as sales
             from orders
            where restaurant_id = $1 and status <> 'cancelled'
              and created_at <= now() - make_interval(days => ${PERIOD_DAYS})
              and created_at > now() - make_interval(days => ${PERIOD_DAYS * 2})`,
        ),
        query<{ rate: number }>(
          `select coalesce(
                    count(*) filter (where status = 'cancelled')::float8
                    / nullif(count(*), 0), 0) as rate
             from orders
            where restaurant_id = $1
              and created_at > now() - make_interval(days => ${PERIOD_DAYS})`,
        ),
        query<{ date: string; orders: number; sales: number }>(
          `select to_char(created_at at time zone '${TIMEZONE}', 'YYYY-MM-DD') as date,
                  count(*)::int as orders, sum(total)::float8 as sales
             from orders where ${inPeriod}
            group by 1 order by 1`,
        ),
        query<{ day: number; orders: number }>(
          `select extract(dow from created_at at time zone '${TIMEZONE}')::int as day,
                  count(*)::int as orders
             from orders where ${inPeriod} group by 1`,
        ),
        query<{ hour: number; orders: number }>(
          `select extract(hour from created_at at time zone '${TIMEZONE}')::int as hour,
                  count(*)::int as orders
             from orders where ${inPeriod} group by 1 order by 1`,
        ),
      ]);

    const [topItems, unsold, [customers]] = await Promise.all([
      query<{ name: string; units: number; sales: number }>(
        `select i.name, sum(i.quantity)::int as units,
                sum(i.quantity * i.unit_price)::float8 as sales
           from order_items i
           join orders o on o.id = i.order_id
          where o.restaurant_id = $1 and o.status <> 'cancelled'
            and o.created_at > now() - make_interval(days => ${PERIOD_DAYS})
          group by i.name
          order by units desc
          limit 8`,
      ),
      query<{ name: string }>(
        `select m.name from menu_items m
          where m.restaurant_id = $1 and m.available
            and not exists (
              select 1 from order_items i
                join orders o on o.id = i.order_id
               where i.menu_item_id = m.id and o.status <> 'cancelled'
                 and o.created_at > now() - make_interval(days => ${PERIOD_DAYS}))
          order by m.name limit 8`,
      ),
      query<{
        new: number;
        returning: number;
        frequent: number;
        at_risk: number;
      }>(
        `with history as (
           select customer_phone, count(*) as total, min(created_at) as first_order,
                  max(created_at) as last_order
             from orders
            where restaurant_id = $1 and status <> 'cancelled'
            group by customer_phone)
         select count(*) filter (where first_order > now() - make_interval(days => ${PERIOD_DAYS}))::int as new,
                count(*) filter (where total > 1)::int as returning,
                count(*) filter (where total >= ${FREQUENT_ORDERS})::int as frequent,
                count(*) filter (where total > 1
                  and last_order < now() - make_interval(days => ${AT_RISK_DAYS}))::int as at_risk
           from history`,
      ),
    ]);
    const [rewards] = await query<{ pending: number }>(
      `select coalesce(sum(rewards_available), 0)::int as pending
         from loyalty_cards where restaurant_id = $1`,
    );

    const repeatRate = totals.repeat_rate;
    const averageTicket =
      totals.orders > 0 ? round(totals.sales / totals.orders) : 0;
    const ordersByWeekday = WEEKDAYS.map((day, index) => ({
      day,
      orders: weekdays.find((row) => row.day === index)?.orders ?? 0,
    }));

    return {
      source: 'real',
      currency: restaurant.currency,
      periodDays: PERIOD_DAYS,
      summary: {
        orders: totals.orders,
        sales: round(totals.sales),
        averageTicket,
        customers: totals.customers,
        repeatRate: round(repeatRate),
        cancelRate: round(cancelled.rate),
        ordersChange: percentChange(totals.orders, previous.orders),
        salesChange: percentChange(totals.sales, previous.sales),
      },
      salesByDay: days.map((row) => ({ ...row, sales: round(row.sales) })),
      ordersByWeekday,
      ordersByHour: hours,
      topItems: topItems.map((item) => ({ ...item, sales: round(item.sales) })),
      unsoldItems: unsold.map(({ name }) => name),
      customers: {
        new: customers.new,
        returning: customers.returning,
        frequent: customers.frequent,
        atRisk: customers.at_risk,
        rewardsPending: rewards.pending,
      },
      benchmark: await this.benchmark(restaurant, {
        averageTicket,
        ordersPerWeek: round((totals.orders / PERIOD_DAYS) * 7),
        repeatRate,
      }),
    };
  }

  // Solo sale la mediana del grupo. Sin suficientes comercios comparables, o si
  // uno domina el grupo, no se muestra nada para no delatar las ventas de nadie.
  private async benchmark(
    restaurant: Restaurant,
    mine: { averageTicket: number; ordersPerWeek: number; repeatRate: number },
  ): Promise<Benchmark> {
    const { rows } = await this.db.query<{
      peers: number;
      top_share: number | null;
      ticket: number | null;
      weekly: number | null;
      repeat_rate: number | null;
    }>(
      `with buyers as (
         select o.restaurant_id, o.customer_phone,
                count(*) as orders, sum(o.total) as sales
           from orders o
           join restaurants r on r.id = o.restaurant_id
          where o.status <> 'cancelled' and r.active and r.id <> $1
            and r.currency = $2
            and o.created_at > now() - make_interval(days => ${PERIOD_DAYS})
          group by o.restaurant_id, o.customer_phone),
       stats as (
         select restaurant_id,
                sum(sales) as sales,
                sum(sales) / sum(orders) as ticket,
                sum(orders)::float8 / ${PERIOD_DAYS} * 7 as weekly,
                count(*) filter (where orders > 1)::float8 / count(*) as repeat_rate
           from buyers
          group by restaurant_id
         having sum(orders) >= ${MIN_PEER_ORDERS})
       select count(*)::int as peers,
              max(sales) / nullif(sum(sales), 0) as top_share,
              percentile_cont(0.5) within group (order by ticket)::float8 as ticket,
              percentile_cont(0.5) within group (order by weekly)::float8 as weekly,
              percentile_cont(0.5) within group (order by repeat_rate)::float8 as repeat_rate
         from stats`,
      [restaurant.id, restaurant.currency],
    );
    const group = rows[0];
    if (group.peers < MIN_PEERS) {
      return {
        available: false,
        reason: `Se necesitan al menos ${MIN_PEERS} comercios comparables para mantener el anonimato.`,
        peers: 0,
        metrics: [],
      };
    }
    if (Number(group.top_share) > MAX_PEER_SHARE) {
      return {
        available: false,
        reason: 'El grupo aún depende demasiado de un solo comercio.',
        peers: 0,
        metrics: [],
      };
    }
    return {
      available: true,
      reason: null,
      peers: group.peers,
      metrics: this.benchmarkMetrics(mine, {
        averageTicket: round(group.ticket ?? 0),
        ordersPerWeek: round(group.weekly ?? 0),
        repeatRate: round(group.repeat_rate ?? 0),
      }),
    };
  }

  private benchmarkMetrics(
    mine: { averageTicket: number; ordersPerWeek: number; repeatRate: number },
    peers: { averageTicket: number; ordersPerWeek: number; repeatRate: number },
  ): Benchmark['metrics'] {
    return [
      {
        key: 'averageTicket',
        label: 'Ticket promedio',
        mine: mine.averageTicket,
        peers: peers.averageTicket,
        unit: 'money',
      },
      {
        key: 'ordersPerWeek',
        label: 'Pedidos por semana',
        mine: mine.ordersPerWeek,
        peers: peers.ordersPerWeek,
        unit: 'number',
      },
      {
        key: 'repeatRate',
        label: 'Clientes que repiten',
        mine: round(mine.repeatRate),
        peers: peers.repeatRate,
        unit: 'percent',
      },
    ];
  }

  // Vista de ejemplo para conocer el plan: usa los platos reales del comercio,
  // pero todas las cifras son inventadas. source: 'demo' obliga al portal a
  // marcarla como tal, y nunca se mezcla con datos reales.
  private async demo(restaurant: Restaurant): Promise<IqDashboard> {
    const { rows } = await this.db.query<{ name: string; price: number }>(
      `select name, price::float8 as price from menu_items
        where restaurant_id = $1 and available
        order by name limit 8`,
      [restaurant.id],
    );
    const dishes = rows.length >= 3 ? rows : DEMO_DISHES;
    const random = seededRandom(restaurant.id);
    const scale = restaurant.currency === 'VES' && rows.length < 3 ? 40 : 1;
    const averagePrice =
      (dishes.reduce((sum, dish) => sum + dish.price, 0) / dishes.length) *
      scale;
    const ticketFactor = 1.6 + random() * 0.6;

    const salesByDay = Array.from({ length: PERIOD_DAYS }, (_, index) => {
      const daysAgo = PERIOD_DAYS - 1 - index;
      const date = dayKey(daysAgo);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const weekend = weekday === 0 || weekday === 5 || weekday === 6;
      const orders = Math.round((weekend ? 9 : 5) + random() * 5);
      const sales = round(
        orders * averagePrice * ticketFactor * (0.9 + random() * 0.2),
      );
      return { date, orders, sales };
    });

    const orders = salesByDay.reduce((sum, day) => sum + day.orders, 0);
    const sales = round(salesByDay.reduce((sum, day) => sum + day.sales, 0));
    const averageTicket = round(sales / orders);
    const customers = Math.round(orders * (0.5 + random() * 0.15));
    const repeatRate = round(0.28 + random() * 0.2);

    const shares = dishes.map((_, index) => (dishes.length - index) * (0.6 + random()));
    const shareTotal = shares.reduce((sum, share) => sum + share, 0);
    const topItems = dishes
      .map((dish, index) => {
        const units = Math.round((orders * 1.7 * shares[index]) / shareTotal);
        return {
          name: dish.name,
          units,
          sales: round(units * dish.price * scale),
        };
      })
      .sort((a, b) => b.units - a.units);

    const ordersByWeekday = WEEKDAYS.map((day, index) => ({
      day,
      orders: salesByDay
        .filter(
          ({ date }) => new Date(`${date}T12:00:00Z`).getUTCDay() === index,
        )
        .reduce((sum, row) => sum + row.orders, 0),
    }));
    const ordersByHour = [11, 12, 13, 14, 15, 18, 19, 20, 21].map((hour) => ({
      hour,
      orders: Math.round(
        (orders / 9) *
          ((hour >= 12 && hour <= 13) || (hour >= 19 && hour <= 20) ? 1.7 : 0.6) *
          (0.85 + random() * 0.3),
      ),
    }));

    const mine = {
      averageTicket,
      ordersPerWeek: round((orders / PERIOD_DAYS) * 7),
      repeatRate,
    };

    return {
      source: 'demo',
      currency: restaurant.currency,
      periodDays: PERIOD_DAYS,
      summary: {
        orders,
        sales,
        averageTicket,
        customers,
        repeatRate,
        cancelRate: round(0.02 + random() * 0.05),
        ordersChange: round(-6 + random() * 22),
        salesChange: round(-4 + random() * 24),
      },
      salesByDay,
      ordersByWeekday,
      ordersByHour,
      topItems: topItems.slice(0, 8),
      unsoldItems: rows.length > 5 ? [rows[rows.length - 1].name] : [],
      customers: {
        new: Math.round(customers * (1 - repeatRate)),
        returning: Math.round(customers * repeatRate),
        frequent: Math.round(customers * repeatRate * 0.4),
        atRisk: Math.round(customers * repeatRate * 0.3),
        rewardsPending: Math.round(2 + random() * 6),
      },
      benchmark: {
        available: true,
        reason: null,
        peers: 12,
        metrics: this.benchmarkMetrics(mine, {
          averageTicket: round(averageTicket * (1.08 + random() * 0.2)),
          ordersPerWeek: round(mine.ordersPerWeek * (0.85 + random() * 0.3)),
          repeatRate: round(repeatRate * (0.85 + random() * 0.3)),
        }),
      },
    };
  }
}
