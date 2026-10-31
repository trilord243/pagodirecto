import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.service.js';
import { SCHEMA } from '../database/schema.js';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service.js';
import { AgentToolError, RestaurantAgentTools } from './agent-tools.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import {
  detectFileType,
  MenuAnalyzerService,
  toScannedMenu,
} from './menu-analyzer.service.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { formatMoney } from './order-page.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { PublicOrderController } from './public-order.controller.js';
import { RestaurantAuthGuard } from './restaurant-auth.guard.js';
import { restaurantPublicId } from './restaurant-id.js';
import { renderQr, renderRestaurantsImage } from './whatsapp-images.js';

const PASSWORD = 'clave-de-prueba';
const PHONE = '584120000000';
const ID_A = restaurantPublicId('a');
const ID_B = restaurantPublicId('b');
const PNG_SIGNATURE = '89504e470d0a1a0a';
const PNG = Buffer.concat([
  Buffer.from(PNG_SIGNATURE, 'hex'),
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
  const sendImage = vi.fn();
  const sendOptions = vi.fn();

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

  async function publishMenu() {
    await asA(api().put('/restaurants/menu'))
      .send({
        currency: 'USD',
        categories: [
          {
            name: 'Arepas',
            items: [
              { name: 'Arepa reina', price: 4.5 },
              { name: 'Cachapa', description: 'Con queso', price: 6.1 },
            ],
          },
        ],
      })
      .expect(200);
    const { body } = await asA(api().get('/restaurants/menu/items'));
    return body as { id: number; name: string }[];
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    lite = new PGlite();
    await lite.exec(SCHEMA);
    const hash = await hashPassword(PASSWORD);
    await lite.query(
      `insert into restaurants (public_id, name, username, password_hash) values
       ($1, 'La Arepera', 'a', $3), ($2, 'La Pizzeria', 'b', $3)`,
      [ID_A, ID_B, hash],
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        MenuController,
        OrdersController,
        PublicOrderController,
      ],
      providers: [
        AuthService,
        MenuService,
        OrdersService,
        RestaurantAgentTools,
        RestaurantAuthGuard,
        { provide: MenuAnalyzerService, useValue: { analyze } },
        { provide: DatabaseService, useValue: pgliteDatabase(lite) },
        {
          provide: WhatsappApiService,
          useValue: { sendImage, sendOptions },
        },
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

  describe('ID del comercio', () => {
    // Valor calculado con restaurantIdFor del portal.
    it('coincide con el que calcula el portal', () => {
      expect(restaurantPublicId('arepera.laesquina')).toMatch(/^PD-[0-9A-F]{8}$/);
      expect(restaurantPublicId('abc')).toBe('PD-BA7816BF');
    });

    it('la base calcula el mismo ID para los comercios existentes', async () => {
      const { rows } = await lite.query<{ id: string }>(
        `select 'PD-' || upper(substr(encode(sha256(convert_to('abc', 'UTF8')), 'hex'), 1, 8)) as id`,
      );

      expect(rows[0].id).toBe(restaurantPublicId('abc'));
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

    it('devuelve el ID del comercio sin exponer la contraseña', async () => {
      const { body } = await api()
        .post('/restaurants/auth/login')
        .send({ username: ' A ', password: PASSWORD })
        .expect(200);
      const { rows } = await lite.query<{ token_hash: string }>(
        'select token_hash from restaurant_sessions',
      );

      expect(body.restaurant).toMatchObject({
        username: 'a',
        restaurantId: ID_A,
      });
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

  describe('registro', () => {
    const register = (username: string, password = PASSWORD) =>
      api().post('/restaurants/auth/register').send({ username, password });

    it('crea el comercio con su ID y deja la sesion iniciada', async () => {
      const { body } = await register('Nuevo.Local').expect(201);

      expect(body.restaurant).toMatchObject({
        username: 'nuevo.local',
        name: 'nuevo.local',
        restaurantId: restaurantPublicId('nuevo.local'),
        currency: 'USD',
      });
      expect(body.restaurant.password_hash).toBeUndefined();
      await api()
        .get('/restaurants/menu')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(200, { currency: 'USD', categories: [] });
    });

    it('la contraseña sirve para entrar despues', async () => {
      await register('nuevo').expect(201);

      await api()
        .post('/restaurants/auth/login')
        .send({ username: 'nuevo', password: PASSWORD })
        .expect(200);
    });

    it('no acepta un usuario repetido ni pisa la contraseña', async () => {
      await register('nuevo').expect(201);

      await register('NUEVO', 'otra-clave').expect(409);

      await login('nuevo');
    });

    it('valida usuario y contraseña como el portal', async () => {
      await register('ab').expect(400);
      await register('con espacios').expect(400);
      await register('valido', '12345').expect(400);
    });

    it('aparece para los clientes solo cuando publica su menu', async () => {
      const { body } = await register('nuevo').expect(201);
      const before = JSON.parse(
        await tools.execute(PHONE, 'listar_restaurantes', {}),
      );

      await api()
        .put('/restaurants/menu')
        .set('Authorization', `Bearer ${body.token}`)
        .send({
          currency: 'USD',
          categories: [{ name: 'Platos', items: [{ name: 'Sopa', price: 3 }] }],
        })
        .expect(200);

      const after = JSON.parse(
        await tools.execute(PHONE, 'listar_restaurantes', {}),
      );
      expect(before).toEqual([]);
      expect(after).toEqual([
        { id: restaurantPublicId('nuevo'), nombre: 'nuevo' },
      ]);
    });
  });

  describe('analisis del menu', () => {
    it('limita los analisis por hora a cada comercio', async () => {
      analyze.mockResolvedValue({ currency: 'USD', categories: [] });
      const upload = (as: typeof asA) =>
        as(api().post('/restaurants/menu/analyze')).attach(
          'files',
          PNG,
          'menu.png',
        );

      for (let i = 0; i < 10; i++) {
        await upload(asA).expect(200);
      }

      await upload(asA).expect(429);
      await upload(asB).expect(200);
    });

    it('recibe varios archivos y no guarda nada', async () => {
      analyze.mockResolvedValue({ currency: 'USD', categories: [] });

      await asA(api().post('/restaurants/menu/analyze'))
        .attach('files', PNG, 'menu-1.png')
        .attach('files', PNG, 'menu-2.png')
        .expect(200);

      expect(analyze.mock.calls[0][0]).toHaveLength(2);
      const { rows } = await lite.query('select id from menu_items');
      expect(rows).toEqual([]);
    });

    it('exige sesion y al menos un archivo', async () => {
      await api()
        .post('/restaurants/menu/analyze')
        .attach('files', PNG, 'menu.png')
        .expect(401);
      await asA(api().post('/restaurants/menu/analyze')).expect(400);
    });

    it('respeta los limites del portal', async () => {
      await asA(api().post('/restaurants/menu/analyze'))
        .attach('files', Buffer.alloc(10 * 1024 * 1024 + 1), 'menu.png')
        .expect(413);

      let tooMany = asA(api().post('/restaurants/menu/analyze'));
      for (let i = 0; i < 6; i++) {
        tooMany = tooMany.attach('files', PNG, `menu-${i}.png`);
      }
      await tooMany.expect(400);

      expect(analyze).not.toHaveBeenCalled();
    });

    it('reconoce el formato por el contenido y no por el nombre', () => {
      expect(detectFileType(PNG)).toBe('image/png');
      expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
      expect(detectFileType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
      expect(detectFileType(Buffer.from('<?php echo 1;'))).toBeUndefined();
    });

    it('entrega el formato del editor del portal', () => {
      const menu = toScannedMenu({
        currency: null,
        items: [
          {
            name: 'Arepa',
            description: null,
            category: 'Arepas',
            price: 4,
            review_reason: null,
          },
          {
            name: 'Dominó',
            description: null,
            category: 'Arepas',
            price: null,
            review_reason: null,
          },
          {
            name: 'Malta',
            description: null,
            category: null,
            price: 1,
            review_reason: 'El nombre no se veía claro en la foto.',
          },
        ],
      });

      expect(menu.currency).toBe('USD');
      expect(menu.categories.map(({ name }) => name)).toEqual([
        'Arepas',
        'Menú',
      ]);
      expect(menu.categories[0].items[1]).toMatchObject({
        available: true,
        reviewReason: 'No pudimos leer el precio.',
      });
      expect(menu.categories[1].items[0].reviewReason).toContain('nombre');
    });
  });

  describe('menu', () => {
    it('publica por categorias y devuelve el mismo formato', async () => {
      await publishMenu();

      const { body } = await asA(api().get('/restaurants/menu')).expect(200);

      expect(body.currency).toBe('USD');
      expect(body.categories[0].name).toBe('Arepas');
      expect(
        body.categories[0].items.map((i: { name: string }) => i.name),
      ).toEqual(['Arepa reina', 'Cachapa']);
    });

    it('publicar reemplaza: lo que se quito desaparece y conserva los ids', async () => {
      const [arepa] = await publishMenu();

      const { body } = await asA(api().put('/restaurants/menu'))
        .send({
          currency: 'VES',
          categories: [
            {
              name: 'Platos',
              items: [{ name: 'AREPA REINA', price: 5, available: false }],
            },
          ],
        })
        .expect(200);

      expect(body.currency).toBe('VES');
      expect(body.categories).toHaveLength(1);
      expect(body.categories[0].items).toEqual([
        expect.objectContaining({
          id: arepa.id,
          name: 'AREPA REINA',
          price: 5,
          available: false,
        }),
      ]);
    });

    it('no fusiona dos platos con el mismo nombre', async () => {
      const { body } = await asA(api().put('/restaurants/menu'))
        .send({
          currency: 'USD',
          categories: [
            { name: 'Arepas', items: [{ name: 'Reina', price: 4 }] },
            { name: 'Especiales', items: [{ name: 'REINA', price: 9 }] },
          ],
        })
        .expect(400);

      expect(body.message[0]).toContain('Hay dos productos llamados');
      await asA(api().get('/restaurants/menu/items')).expect(200, []);
    });

    it('explica los errores de validacion en español', async () => {
      const { body } = await asA(api().post('/restaurants/menu/items'))
        .send({ name: 'x'.repeat(121), price: 1 })
        .expect(400);

      expect(body.message[0]).toContain('Demasiado');
    });

    it('no acepta publicar sin precio, con precio 0 o sin categoria', async () => {
      const publish = (categories: unknown[]) =>
        asA(api().put('/restaurants/menu')).send({
          currency: 'USD',
          categories,
        });

      await publish([
        { name: 'Arepas', items: [{ name: 'Arepa', price: null }] },
      ]).expect(400);
      await publish([
        { name: 'Arepas', items: [{ name: 'Arepa', price: 0 }] },
      ]).expect(400);
      await publish([{ name: '', items: [{ name: 'Arepa', price: 1 }] }]).expect(
        400,
      );
      await publish([]).expect(400);
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
      const [item] = await publishMenu();

      await asA(api().patch(`/restaurants/menu/items/${item.id}`))
        .send({ restaurant_id: 2 })
        .expect(400);
    });

    it('avisa si el nombre ya existe', async () => {
      await publishMenu();

      await asA(api().post('/restaurants/menu/items'))
        .send({ name: 'cachapa', price: 1 })
        .expect(409);
    });

    it('un restaurante no ve ni toca el menu de otro', async () => {
      const [item] = await publishMenu();

      await asB(api().get('/restaurants/menu/items')).expect(200, []);
      await asB(api().patch(`/restaurants/menu/items/${item.id}`))
        .send({ price: 1 })
        .expect(404);
      await asB(api().delete(`/restaurants/menu/items/${item.id}`)).expect(404);
    });
  });

  describe('agente de WhatsApp', () => {
    const run = async (name: string, input = {}) =>
      JSON.parse(await tools.execute(PHONE, name, input));

    async function order(items: { item_id: number; cantidad: number }[]) {
      return run('crear_pedido', {
        restaurante: ID_A,
        nombre_cliente: 'Ana',
        notas: 'Enviar a Calle 1, casa 2',
        items,
      });
    }

    it('solo lista restaurantes con menu disponible, por su ID', async () => {
      expect(await run('listar_restaurantes')).toEqual([]);

      await publishMenu();

      expect(await run('listar_restaurantes')).toEqual([
        { id: ID_A, nombre: 'La Arepera' },
      ]);
    });

    it('envia la foto de restaurantes como PNG real', async () => {
      await publishMenu();

      await run('enviar_foto_restaurantes');

      const [phone, image] = sendImage.mock.calls[0];
      expect(phone).toBe(PHONE);
      expect(image.toString('hex', 0, 8)).toBe(PNG_SIGNATURE);
    });

    it('no intenta enviar una foto vacia', async () => {
      await expect(run('enviar_foto_restaurantes')).rejects.toThrow(
        AgentToolError,
      );
      expect(sendImage).not.toHaveBeenCalled();
    });

    it('la foto no se rompe con caracteres especiales', async () => {
      const image = await renderRestaurantsImage([
        { id: ID_A, name: `Pepe's <Grill> & Bar "Ñandú"` },
      ]);

      expect(image.toString('hex', 0, 8)).toBe(PNG_SIGNATURE);
    });

    it('oculta del menu lo que no esta disponible y agrupa', async () => {
      const [item] = await publishMenu();
      await asA(api().patch(`/restaurants/menu/items/${item.id}`)).send({
        available: false,
      });

      const menu = await run('ver_menu', { restaurante: ID_A.toLowerCase() });

      expect(menu.categorias).toEqual([
        {
          name: 'Arepas',
          items: [expect.objectContaining({ nombre: 'Cachapa', precio: 6.1 })],
        },
      ]);
    });

    it('envia opciones interactivas y valida su cantidad', async () => {
      await tools.execute(PHONE, 'enviar_opciones', {
        texto: '¿Qué quieres?',
        opciones: [
          { id: '1', titulo: 'Arepas', descripcion: 'Desde $4' },
          { id: '2', titulo: 'Bebidas' },
        ],
      });

      expect(sendOptions).toHaveBeenCalledWith(
        PHONE,
        '¿Qué quieres?',
        'Ver opciones',
        [
          { id: '1', title: 'Arepas', description: 'Desde $4' },
          { id: '2', title: 'Bebidas', description: undefined },
        ],
      );
      await expect(
        tools.execute(PHONE, 'enviar_opciones', {
          texto: 'Una sola',
          opciones: [{ id: '1', titulo: 'Arepas' }],
        }),
      ).rejects.toThrow(AgentToolError);
    });

    it('calcula el total con los precios de la base', async () => {
      const [arepa, cachapa] = await publishMenu();

      const result = await order([
        { item_id: arepa.id, cantidad: 3 },
        { item_id: cachapa.id, cantidad: 1 },
      ]);

      expect(result).toMatchObject({ total: 19.6, moneda: 'USD' });
    });

    it('ignora un precio inventado por el agente', async () => {
      const [arepa] = await publishMenu();

      const result = await run('crear_pedido', {
        restaurante: ID_A,
        nombre_cliente: 'Ana',
        total: 0.01,
        items: [{ item_id: arepa.id, cantidad: 2, precio: 0.01 }],
      });

      expect(result.total).toBe(9);
    });

    it('rechaza platos no disponibles o de otro restaurante', async () => {
      const [arepa] = await publishMenu();
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
      expect(sendImage).not.toHaveBeenCalled();
    });

    it('no acepta cantidades invalidas', async () => {
      const [arepa] = await publishMenu();

      await expect(order([{ item_id: arepa.id, cantidad: 0 }])).rejects.toThrow(
        AgentToolError,
      );
    });

    it('envia el QR con el enlace del pedido', async () => {
      const [arepa] = await publishMenu();

      const result = await order([{ item_id: arepa.id, cantidad: 2 }]);

      const [phone, image, caption] = sendImage.mock.calls[0];
      expect(phone).toBe(PHONE);
      expect(image.toString('hex', 0, 8)).toBe(PNG_SIGNATURE);
      expect(caption).toContain(result.enlace);
      expect(caption).toContain('$9,00');
      expect(result.enlace).toMatch(/\/pedido\/[a-f0-9]{32}$/);
      expect(result.qr_enviado).toBe(true);
    });

    it('si el QR falla no pierde el pedido ni lo repite', async () => {
      sendImage.mockRejectedValueOnce(new Error('Graph API 500'));
      const [arepa] = await publishMenu();

      const result = await order([{ item_id: arepa.id, cantidad: 1 }]);

      expect(result).toMatchObject({ qr_enviado: false });
      expect(result.enlace).toBeDefined();
      const { rows } = await lite.query('select id from orders');
      expect(rows).toHaveLength(1);
    });

    it('genera un QR valido', async () => {
      const qr = await renderQr('https://api.example.com/pedido/abc');

      expect(qr.toString('hex', 0, 8)).toBe(PNG_SIGNATURE);
    });

    it('el pedido le llega solo a su restaurante, con el telefono real', async () => {
      const [arepa] = await publishMenu();
      const { pedido } = await order([{ item_id: arepa.id, cantidad: 2 }]);

      const { body } = await asA(api().get('/restaurants/orders')).expect(200);

      expect(body[0]).toMatchObject({
        id: pedido,
        customer_name: 'Ana',
        customer_phone: PHONE,
        notes: 'Enviar a Calle 1, casa 2',
        status: 'pending',
        payment_status: 'pending',
        total: 9,
        items: [{ name: 'Arepa reina', quantity: 2, unit_price: 4.5 }],
      });
      await asB(api().get('/restaurants/orders')).expect(200, []);
    });

    it('el pedido conserva nombre y precio aunque cambie el menu', async () => {
      const [arepa] = await publishMenu();
      await order([{ item_id: arepa.id, cantidad: 1 }]);

      await asA(api().delete(`/restaurants/menu/items/${arepa.id}`)).expect(204);

      const { body } = await asA(api().get('/restaurants/orders'));
      expect(body[0].items[0]).toMatchObject({
        name: 'Arepa reina',
        unit_price: 4.5,
      });
    });

    it('solo el restaurante dueño cambia el estado del pedido', async () => {
      const [arepa] = await publishMenu();
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

    describe('pagina del QR', () => {
      async function openOrder() {
        const [arepa, cachapa] = await publishMenu();
        const { enlace, pedido } = await order([
          { item_id: arepa.id, cantidad: 2 },
          { item_id: cachapa.id, cantidad: 1 },
        ]);
        return { path: new URL(enlace).pathname, pedido };
      }

      it('muestra comercio, cada item con su monto y el total', async () => {
        const { path } = await openOrder();

        const { text } = await api().get(path).expect(200);

        expect(text).toContain('La Arepera');
        expect(text).toContain(ID_A);
        expect(text).toContain('2 × Arepa reina');
        expect(text).toContain('$4,50 c/u');
        expect(text).toContain('$9,00');
        expect(text).toContain('1 × Cachapa');
        expect(text).toContain('$6,10');
        expect(text).toContain('$15,10');
        expect(text).toContain('Pendiente de pago');
      });

      it('entrega los mismos datos en JSON a la app de pago', async () => {
        const { path, pedido } = await openOrder();

        const { body } = await api()
          .get(path)
          .set('Accept', 'application/json')
          .expect(200);

        expect(body).toMatchObject({
          id: pedido,
          restaurant: { id: ID_A, name: 'La Arepera' },
          paymentStatus: 'pending',
          currency: 'USD',
          total: 15.1,
          items: [
            { name: 'Arepa reina', quantity: 2, unitPrice: 4.5, amount: 9 },
            { name: 'Cachapa', quantity: 1, unitPrice: 6.1, amount: 6.1 },
          ],
        });
      });

      it('no muestra datos personales del cliente', async () => {
        const { path } = await openOrder();

        const { text } = await api().get(path);
        const json = await api().get(path).set('Accept', 'application/json');

        for (const content of [text, JSON.stringify(json.body)]) {
          expect(content).not.toContain(PHONE);
          expect(content).not.toContain('Ana');
          expect(content).not.toContain('Calle 1');
        }
      });

      it('escapa el HTML de los nombres', async () => {
        const { body: item } = await asA(api().post('/restaurants/menu/items'))
          .send({ name: '<script>alert(1)</script>', price: 1 })
          .expect(201);
        const { enlace } = await order([{ item_id: item.id, cantidad: 1 }]);

        const { text, headers } = await api().get(new URL(enlace).pathname);

        expect(text).not.toContain('<script>');
        expect(headers['content-security-policy']).toContain(
          "default-src 'none'",
        );
      });

      it('refleja cuando el comercio marca el pedido como pagado', async () => {
        const { path, pedido } = await openOrder();

        await asA(api().patch(`/restaurants/orders/${pedido}`))
          .send({ paymentStatus: 'paid' })
          .expect(200);

        const { text } = await api().get(path);
        expect(text).toContain('Pagado');
        expect(text).not.toContain('Pendiente de pago');
      });

      it('responde 404 con un token invalido o inexistente', async () => {
        await api().get('/pedido/1').expect(404);
        await api().get(`/pedido/${'a'.repeat(32)}`).expect(404);
        await api()
          .get('/pedido/1')
          .set('Accept', 'application/json')
          .expect(404);
      });
    });

    it('formatea montos en ambas monedas', () => {
      expect(formatMoney(1234.5, 'USD')).toBe('$1.234,50');
      expect(formatMoney(8, 'VES')).toBe('Bs 8,00');
    });
  });
});
