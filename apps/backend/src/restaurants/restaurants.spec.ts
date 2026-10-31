import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.service.js';
import { SCHEMA } from '../database/schema.js';
import { AgentToolError, RestaurantAgentTools } from './agent-tools.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { detectImageType, MenuAnalyzerService } from './menu-analyzer.service.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { RestaurantAuthGuard } from './restaurant-auth.guard.js';

const PASSWORD = 'clave-de-prueba';
const PHONE = '584120000000';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);

// PGlite es Postgres real: el SQL de los servicios corre tal cual en produccion.
function pgliteDatabase(lite: PGlite) {
  return {
    query: async <Row>(text: string, params: unknown[] = []) => {
      const { rows } = await lite.query<Row>(text, params as never[]);
      return { rows };
    },
    transaction: <T>(work: (tx: Queryable) => Promise<T>): Promise<T> =>
      lite.transaction((tx) =>
        work({
          query: async <Row>(text: string, params: unknown[] = []) => {
            const { rows } = await tx.query<Row>(text, params as never[]);
            return { rows };
          },
        }),
      ) as Promise<T>,
  };
}

describe('restaurantes', () => {
  let lite: PGlite;
  let app: INestApplication;
  let tools: RestaurantAgentTools;
  let tokenA: string;
  let tokenB: string;
  const analyze = vi.fn();

  const api = () => request(app.getHttpServer());
  const asA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const asB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  async function login(username: string): Promise<string> {
    const { body } = await api()
      .post('/restaurants/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return body.token;
  }

  async function confirmMenu() {
    const { body } = await asA(api().post('/restaurants/menu/confirm')).send({
      currency: 'usd',
      items: [
        { name: 'Arepa reina', category: 'Arepas', price: 4.5 },
        { name: 'Cachapa', description: 'Con queso', price: 6.1 },
      ],
    });
    return body as { id: number; name: string }[];
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    lite = new PGlite();
    await lite.exec(SCHEMA);
    const hash = await hashPassword(PASSWORD);
    await lite.query(
      `insert into restaurants (slug, name, username, password_hash) values
       ('arepera', 'La Arepera', 'a', $1), ('pizzeria', 'La Pizzeria', 'b', $1)`,
      [hash],
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, MenuController, OrdersController],
      providers: [
        AuthService,
        MenuService,
        OrdersService,
        RestaurantAgentTools,
        RestaurantAuthGuard,
        { provide: MenuAnalyzerService, useValue: { analyze } },
        { provide: DatabaseService, useValue: pgliteDatabase(lite) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    tools = app.get(RestaurantAgentTools);
    tokenA = await login('a');
    tokenB = await login('b');
  });

  afterEach(async () => {
    await app.close();
    await lite.close();
  });

  describe('contraseñas', () => {
    it('verifica solo la contraseña correcta', async () => {
      const hash = await hashPassword('secreto');

      expect(await verifyPassword('secreto', hash)).toBe(true);
      expect(await verifyPassword('otro', hash)).toBe(false);
      expect(hash).not.toContain('secreto');
    });
  });

  describe('login', () => {
    it('rechaza contraseña o usuario incorrectos con el mismo error', async () => {
      const wrongPassword = await api()
        .post('/restaurants/auth/login')
        .send({ username: 'a', password: 'mala' })
        .expect(401);
      const wrongUser = await api()
        .post('/restaurants/auth/login')
        .send({ username: 'nadie', password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe(wrongUser.body.message);
    });

    it('no guarda el token ni expone la contraseña', async () => {
      const { body } = await api()
        .post('/restaurants/auth/login')
        .send({ username: 'a', password: PASSWORD })
        .expect(200);
      const { rows } = await lite.query<{ token_hash: string }>(
        'select token_hash from restaurant_sessions',
      );

      expect(body.restaurant.password_hash).toBeUndefined();
      expect(rows.map((row) => row.token_hash)).not.toContain(body.token);
    });

    it('exige sesion y la invalida al salir', async () => {
      await api().get('/restaurants/me').expect(401);
      await asA(api().get('/restaurants/me')).expect(200);

      await asA(api().post('/restaurants/auth/logout')).expect(204);

      await asA(api().get('/restaurants/me')).expect(401);
    });

    it('rechaza una sesion vencida', async () => {
      await lite.query(
        `update restaurant_sessions set expires_at = now() - interval '1 minute'`,
      );

      await asA(api().get('/restaurants/me')).expect(401);
    });
  });

  describe('analisis del menu', () => {
    it('devuelve lo leido sin guardar nada', async () => {
      analyze.mockResolvedValue({ currency: 'USD', items: [{ name: 'Arepa' }] });

      const { body } = await asA(api().post('/restaurants/menu/analyze'))
        .attach('image', PNG, 'menu.png')
        .expect(200);

      expect(body.items).toEqual([{ name: 'Arepa' }]);
      const { rows } = await lite.query('select id from menu_items');
      expect(rows).toEqual([]);
    });

    it('exige sesion y una imagen', async () => {
      await api()
        .post('/restaurants/menu/analyze')
        .attach('image', PNG, 'menu.png')
        .expect(401);
      await asA(api().post('/restaurants/menu/analyze')).expect(400);
    });

    it('rechaza imagenes de mas de 5 MB', async () => {
      await asA(api().post('/restaurants/menu/analyze'))
        .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'menu.png')
        .expect(413);

      expect(analyze).not.toHaveBeenCalled();
    });

    it('reconoce el formato por el contenido y no por el nombre', () => {
      expect(detectImageType(PNG)).toBe('image/png');
      expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
      expect(detectImageType(Buffer.from('<?php echo 1;'))).toBeUndefined();
    });
  });

  describe('menu', () => {
    it('al confirmar guarda los platos y la moneda', async () => {
      const items = await confirmMenu();

      expect(items.map((item) => item.name)).toEqual([
        'Arepa reina',
        'Cachapa',
      ]);
      const { body } = await asA(api().get('/restaurants/me'));
      expect(body.currency).toBe('USD');
    });

    it('confirmar de nuevo actualiza por nombre y conserva lo demas', async () => {
      await confirmMenu();

      const { body } = await asA(api().post('/restaurants/menu/confirm')).send({
        items: [{ name: 'AREPA REINA', price: 5 }],
      });

      expect(body).toHaveLength(2);
      expect(body.find((i: { price: number }) => i.price === 5)).toBeDefined();
    });

    it('no acepta confirmar un plato sin precio', async () => {
      await asA(api().post('/restaurants/menu/confirm'))
        .send({ items: [{ name: 'Arepa', price: null }] })
        .expect(400);
    });

    it('permite crear, cambiar disponibilidad y borrar', async () => {
      const { body: created } = await asA(api().post('/restaurants/menu/items'))
        .send({ name: 'Malta', price: 1.5 })
        .expect(201);

      const { body: updated } = await asA(
        api().patch(`/restaurants/menu/items/${created.id}`),
      )
        .send({ available: false })
        .expect(200);
      expect(updated.available).toBe(false);

      await asA(api().delete(`/restaurants/menu/items/${created.id}`)).expect(
        204,
      );
      await asA(api().get('/restaurants/menu/items')).expect(200, []);
    });

    it('rechaza columnas ajenas al editar', async () => {
      const [item] = await confirmMenu();

      await asA(api().patch(`/restaurants/menu/items/${item.id}`))
        .send({ restaurant_id: 2 })
        .expect(400);
    });

    it('avisa si el nombre ya existe', async () => {
      await confirmMenu();

      await asA(api().post('/restaurants/menu/items'))
        .send({ name: 'cachapa', price: 1 })
        .expect(409);
    });

    it('un restaurante no ve ni toca el menu de otro', async () => {
      const [item] = await confirmMenu();

      await asB(api().get('/restaurants/menu/items')).expect(200, []);
      await asB(api().patch(`/restaurants/menu/items/${item.id}`))
        .send({ price: 0 })
        .expect(404);
      await asB(api().delete(`/restaurants/menu/items/${item.id}`)).expect(404);
    });
  });

  describe('agente de WhatsApp', () => {
    const run = async (name: string, input = {}) =>
      JSON.parse(await tools.execute(PHONE, name, input));

    async function order(items: { item_id: number; cantidad: number }[]) {
      return run('crear_pedido', {
        restaurante: 'arepera',
        nombre_cliente: 'Ana',
        notas: 'Para retirar',
        items,
      });
    }

    it('solo lista restaurantes con menu disponible', async () => {
      expect(await run('listar_restaurantes')).toEqual([]);

      await confirmMenu();

      expect(await run('listar_restaurantes')).toEqual([
        { restaurante: 'arepera', nombre: 'La Arepera' },
      ]);
    });

    it('oculta del menu lo que no esta disponible', async () => {
      const [item] = await confirmMenu();
      await asA(api().patch(`/restaurants/menu/items/${item.id}`)).send({
        available: false,
      });

      const menu = await run('ver_menu', { restaurante: 'arepera' });

      expect(menu.items.map((i: { nombre: string }) => i.nombre)).toEqual([
        'Cachapa',
      ]);
    });

    it('calcula el total con los precios de la base', async () => {
      const [arepa, cachapa] = await confirmMenu();

      const result = await order([
        { item_id: arepa.id, cantidad: 3 },
        { item_id: cachapa.id, cantidad: 1 },
      ]);

      expect(result).toMatchObject({ total: 19.6, moneda: 'USD' });
    });

    it('ignora un precio inventado por el agente', async () => {
      const [arepa] = await confirmMenu();

      const result = await run('crear_pedido', {
        restaurante: 'arepera',
        nombre_cliente: 'Ana',
        total: 0.01,
        items: [{ item_id: arepa.id, cantidad: 2, precio: 0.01 }],
      });

      expect(result.total).toBe(9);
    });

    it('rechaza platos no disponibles o de otro restaurante', async () => {
      const [arepa] = await confirmMenu();
      const { body: pizza } = await asB(
        api().post('/restaurants/menu/items'),
      ).send({ name: 'Pizza', price: 8 });
      await asA(api().patch(`/restaurants/menu/items/${arepa.id}`)).send({
        available: false,
      });

      await expect(order([{ item_id: arepa.id, cantidad: 1 }])).rejects.toThrow(
        AgentToolError,
      );
      await expect(order([{ item_id: pizza.id, cantidad: 1 }])).rejects.toThrow(
        AgentToolError,
      );

      const { rows } = await lite.query('select id from orders');
      expect(rows).toEqual([]);
    });

    it('no acepta cantidades invalidas', async () => {
      const [arepa] = await confirmMenu();

      await expect(order([{ item_id: arepa.id, cantidad: 0 }])).rejects.toThrow(
        AgentToolError,
      );
    });

    it('el pedido le llega solo a su restaurante, con el telefono real', async () => {
      const [arepa] = await confirmMenu();
      const { pedido } = await order([{ item_id: arepa.id, cantidad: 2 }]);

      const { body } = await asA(api().get('/restaurants/orders')).expect(200);

      expect(body[0]).toMatchObject({
        id: pedido,
        customer_name: 'Ana',
        customer_phone: PHONE,
        notes: 'Para retirar',
        status: 'pending',
        total: 9,
        items: [{ name: 'Arepa reina', quantity: 2, unit_price: 4.5 }],
      });
      await asB(api().get('/restaurants/orders')).expect(200, []);
    });

    it('el pedido conserva nombre y precio aunque cambie el menu', async () => {
      const [arepa] = await confirmMenu();
      await order([{ item_id: arepa.id, cantidad: 1 }]);

      await asA(api().delete(`/restaurants/menu/items/${arepa.id}`)).expect(204);

      const { body } = await asA(api().get('/restaurants/orders'));
      expect(body[0].items[0]).toMatchObject({
        name: 'Arepa reina',
        unit_price: 4.5,
      });
    });

    it('solo el restaurante dueño cambia el estado del pedido', async () => {
      const [arepa] = await confirmMenu();
      const { pedido } = await order([{ item_id: arepa.id, cantidad: 1 }]);

      await asB(api().patch(`/restaurants/orders/${pedido}`))
        .send({ status: 'cancelled' })
        .expect(404);
      await asA(api().patch(`/restaurants/orders/${pedido}`))
        .send({ status: 'nada' })
        .expect(400);
      const { body } = await asA(api().patch(`/restaurants/orders/${pedido}`))
        .send({ status: 'confirmed' })
        .expect(200);

      expect(body.status).toBe('confirmed');
    });
  });
});
