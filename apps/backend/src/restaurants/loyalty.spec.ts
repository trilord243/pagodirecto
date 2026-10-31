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
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';
import { LoyaltyController } from './loyalty.controller.js';
import { LoyaltyService } from './loyalty.service.js';
import { MENU_ANALYZER_CLIENT } from './menu-analyzer.service.js';
import { MenuController } from './menu.controller.js';
import { MenuAnalyzerService } from './menu-analyzer.service.js';
import { MenuService } from './menu.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { hashPassword } from './passwords.js';
import { PublicOrderController } from './public-order.controller.js';
import { RestaurantAuthGuard } from './restaurant-auth.guard.js';
import { restaurantPublicId } from './restaurant-id.js';
import { renderLoyaltyCard } from './whatsapp-images.js';

const PASSWORD = 'clave-de-prueba';
const ID_A = restaurantPublicId('a');
const CUSTOMER = { phone: '584120000000', name: 'Ana' };
const OTHER = { phone: '584140000000', name: 'Luis' };
const PNG_SIGNATURE = '89504e470d0a1a0a';

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

describe('fidelidad y promociones', () => {
  let lite: PGlite;
  let app: INestApplication;
  let tools: RestaurantAgentTools;
  let tokenA: string;
  let tokenB: string;
  let arepa: { id: number };
  let malta: { id: number };
  const sendImage = vi.fn();
  const parse = vi.fn();

  const api = () => request(app.getHttpServer());
  const asA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const asB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  const run = async (
    name: string,
    input: Record<string, unknown>,
    customer = CUSTOMER,
  ) => JSON.parse(await tools.execute(customer, name, input));

  const order = (input = {}, customer = CUSTOMER) =>
    run(
      'crear_pedido',
      {
        restaurante: ID_A,
        items: [{ item_id: arepa.id, cantidad: 2 }],
        ...input,
      },
      customer,
    );

  const pay = (id: number) =>
    asA(api().patch(`/restaurants/orders/${id}`))
      .send({ paymentStatus: 'paid' })
      .expect(200);

  const setProgram = (stampsRequired = 2) =>
    asA(api().put('/restaurants/loyalty'))
      .send({ stampsRequired, rewardItemId: malta.id })
      .expect(200);

  async function login(username: string): Promise<string> {
    const { body } = await api()
      .post('/restaurants/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return body.token;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    lite = new PGlite();
    await lite.exec(SCHEMA);
    const hash = await hashPassword(PASSWORD);
    await lite.query(
      `insert into restaurants (public_id, name, username, password_hash) values
       ($1, 'La Arepera', 'a', $3), ($2, 'La Pizzeria', 'b', $3)`,
      [ID_A, restaurantPublicId('b'), hash],
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        InsightsController,
        LoyaltyController,
        MenuController,
        OrdersController,
        PublicOrderController,
      ],
      providers: [
        AuthService,
        InsightsService,
        LoyaltyService,
        MenuService,
        OrdersService,
        RestaurantAgentTools,
        RestaurantAuthGuard,
        { provide: MenuAnalyzerService, useValue: {} },
        {
          provide: MENU_ANALYZER_CLIENT,
          useValue: { beta: { messages: { parse } } },
        },
        { provide: DatabaseService, useValue: pgliteDatabase(lite) },
        { provide: WhatsappApiService, useValue: { sendImage } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    tools = app.get(RestaurantAgentTools);
    tokenA = await login('a');
    tokenB = await login('b');

    await asA(api().put('/restaurants/menu')).send({
      currency: 'USD',
      categories: [
        {
          name: 'Platos',
          items: [
            { name: 'Arepa', price: 10 },
            { name: 'Malta', price: 2 },
          ],
        },
      ],
    });
    const { body } = await asA(api().get('/restaurants/menu/items'));
    arepa = body.find((i: { name: string }) => i.name === 'Arepa');
    malta = body.find((i: { name: string }) => i.name === 'Malta');
  });

  afterEach(async () => {
    await app.close();
    await lite.close();
  });

  describe('tarjeta', () => {
    it('el comercio escoge cuantas compras y que plato de premio', async () => {
      const { body } = await setProgram(5);

      expect(body.program).toMatchObject({
        stampsRequired: 5,
        rewardItemId: malta.id,
        rewardName: 'Malta',
        active: true,
      });
    });

    it('no acepta de premio un plato de otro comercio', async () => {
      await asB(api().put('/restaurants/loyalty'))
        .send({ stampsRequired: 5, rewardItemId: malta.id })
        .expect(400);
    });

    it('no suma por pedir: solo cuando el pedido se paga', async () => {
      await setProgram();
      await order();

      const { body } = await asA(api().get('/restaurants/loyalty'));

      expect(body.customers).toEqual([]);
    });

    it('suma una compra al pagar y le avisa con la imagen de su tarjeta', async () => {
      await setProgram(3);
      const { pedido } = await order();

      await pay(pedido);

      const { body } = await asA(api().get('/restaurants/loyalty'));
      expect(body.customers[0]).toMatchObject({
        phone: CUSTOMER.phone,
        name: 'Ana',
        stamps: 1,
        purchases: 1,
      });
      await vi.waitFor(() => expect(sendImage).toHaveBeenCalledTimes(2));
      const [phone, image, caption] = sendImage.mock.calls[1];
      expect(phone).toBe(CUSTOMER.phone);
      expect(image.toString('hex', 0, 8)).toBe(PNG_SIGNATURE);
      expect(caption).toContain('Llevas 1 de 3');
    });

    it('un pedido no suma dos veces', async () => {
      await setProgram(3);
      const { pedido } = await order();

      await pay(pedido);
      await pay(pedido);

      const { body } = await asA(api().get('/restaurants/loyalty'));
      expect(body.customers[0].stamps).toBe(1);
    });

    it('si falla el aviso, la compra queda contada', async () => {
      await setProgram(3);
      const { pedido } = await order();
      sendImage.mockRejectedValueOnce(new Error('fuera de la ventana de 24h'));

      await pay(pedido);

      const { body } = await asA(api().get('/restaurants/loyalty'));
      expect(body.customers[0].stamps).toBe(1);
    });

    it('al completarla gana el premio y la tarjeta vuelve a cero', async () => {
      await setProgram(2);
      await pay((await order()).pedido);
      await pay((await order()).pedido);

      const { body } = await asA(api().get('/restaurants/loyalty'));

      expect(body.customers[0]).toMatchObject({
        stamps: 0,
        rewardsAvailable: 1,
        purchases: 2,
      });
    });

    it('cada cliente tiene su tarjeta por numero', async () => {
      await setProgram(2);
      await pay((await order()).pedido);
      await pay((await order({}, OTHER)).pedido);

      const { body } = await asA(api().get('/restaurants/loyalty'));

      expect(body.customers.map((c: { stamps: number }) => c.stamps)).toEqual([
        1, 1,
      ]);
    });

    it('el premio sale gratis, una sola vez, y no cambia el total', async () => {
      await setProgram(2);
      await pay((await order()).pedido);
      await pay((await order()).pedido);

      const quote = await run('calcular_pedido', {
        restaurante: ID_A,
        items: [{ item_id: arepa.id, cantidad: 1 }],
      });
      expect(quote.premio_disponible).toBe('Malta');

      const { enlace } = await order({
        usar_recompensa: true,
        items: [{ item_id: arepa.id, cantidad: 1 }],
      });

      const { body } = await api()
        .get(new URL(enlace).pathname)
        .set('Accept', 'application/json');
      expect(body.total).toBe(10);
      expect(body.items[1]).toMatchObject({ name: 'Malta', unitPrice: 0 });
      await expect(order({ usar_recompensa: true })).rejects.toThrow(
        AgentToolError,
      );
    });

    it('no da premio a quien no lo tiene', async () => {
      await setProgram(2);

      await expect(order({ usar_recompensa: true })).rejects.toThrow(
        AgentToolError,
      );
    });

    it('envia al cliente la imagen de su tarjeta', async () => {
      await setProgram(5);

      const card = await run('ver_tarjeta', { restaurante: ID_A });

      expect(card).toMatchObject({ compras: 0, compras_necesarias: 5 });
      expect(sendImage).toHaveBeenCalledTimes(1);
    });

    it('sin programa no hay tarjeta que mostrar', async () => {
      await expect(run('ver_tarjeta', { restaurante: ID_A })).rejects.toThrow(
        AgentToolError,
      );
    });

    it('la tarjeta se dibuja con cualquier cantidad y caracteres raros', async () => {
      const image = await renderLoyaltyCard({
        restaurant: `Pepe's <Grill> & "Ñandú"`,
        stamps: 7,
        stampsRequired: 12,
        rewardName: 'Café & <dulce>',
        rewardsAvailable: 0,
      });

      expect(image.toString('hex', 0, 8)).toBe(PNG_SIGNATURE);
    });
  });

  describe('promociones', () => {
    const createPromotion = (data: object) =>
      asA(api().post('/restaurants/promotions')).send(data).expect(201);

    it('descuenta en el pedido y lo muestra en el enlace del QR', async () => {
      await createPromotion({ name: 'Semana feliz', percent: 10 });

      const { enlace, total, descuento } = await order();

      expect({ total, descuento }).toEqual({ total: 18, descuento: 2 });
      const { text } = await api().get(new URL(enlace).pathname);
      expect(text).toContain('Semana feliz');
      expect(text).toContain('$18,00');
    });

    it('calcular y crear dan el mismo total', async () => {
      await createPromotion({ name: 'Semana feliz', percent: 15 });
      const input = {
        restaurante: ID_A,
        items: [{ item_id: arepa.id, cantidad: 3 }],
      };

      const quote = await run('calcular_pedido', input);
      const placed = await run('crear_pedido', input);

      expect(quote.total).toBe(placed.total);
      expect(quote.promocion).toBe('Semana feliz');
    });

    it('aplica solo la mejor, sin acumular', async () => {
      await createPromotion({ name: 'Diez', percent: 10 });
      await createPromotion({ name: 'Veinte', percent: 20 });

      const quote = await run('calcular_pedido', {
        restaurante: ID_A,
        items: [{ item_id: arepa.id, cantidad: 1 }],
      });

      expect(quote).toMatchObject({ promocion: 'Veinte', descuento: 2 });
    });

    it('el descuento por fidelidad exige compras pagadas', async () => {
      await createPromotion({ name: 'Cliente fiel', percent: 25, minPurchases: 2 });
      const input = {
        restaurante: ID_A,
        items: [{ item_id: arepa.id, cantidad: 1 }],
      };

      expect((await run('calcular_pedido', input)).descuento).toBe(0);

      await pay((await order()).pedido);
      await pay((await order()).pedido);

      expect((await run('calcular_pedido', input)).descuento).toBe(2.5);
    });

    it('respeta el monto minimo', async () => {
      await createPromotion({ name: 'Grande', percent: 10, minTotal: 25 });
      const quote = (cantidad: number) =>
        run('calcular_pedido', {
          restaurante: ID_A,
          items: [{ item_id: arepa.id, cantidad }],
        });

      expect((await quote(2)).descuento).toBe(0);
      expect((await quote(3)).descuento).toBe(3);
    });

    it('una promocion inactiva no aplica', async () => {
      const { body } = await createPromotion({ name: 'Vieja', percent: 50 });

      await asA(api().patch(`/restaurants/promotions/${body.id}`))
        .send({ active: false })
        .expect(200);

      expect((await order()).descuento).toBe(0);
    });

    it('rechaza porcentajes imposibles', async () => {
      await asA(api().post('/restaurants/promotions'))
        .send({ name: 'Mala', percent: 120 })
        .expect(400);
    });

    it('un comercio no toca las promociones de otro', async () => {
      const { body } = await createPromotion({ name: 'Mia', percent: 10 });

      await asB(api().patch(`/restaurants/promotions/${body.id}`))
        .send({ active: false })
        .expect(404);
      await asB(api().delete(`/restaurants/promotions/${body.id}`)).expect(404);
      await asB(api().get('/restaurants/promotions')).expect(200, []);
    });

    it('el agente ve promociones y tarjeta en el menu', async () => {
      await setProgram(5);
      await createPromotion({ name: 'Semana feliz', percent: 10 });

      const menu = await run('ver_menu', { restaurante: ID_A });

      expect(menu.tarjeta).toEqual({ compras_necesarias: 5, premio: 'Malta' });
      expect(menu.promociones[0]).toMatchObject({
        nombre: 'Semana feliz',
        porcentaje: 10,
      });
    });
  });

  describe('asesor de negocio', () => {
    const report = {
      resumen: 'Vas bien.',
      hallazgos: [],
      mejoras: [],
      promociones: [],
    };
    const enable = () =>
      lite.query(`update restaurants set insights_enabled = true where username = 'a'`);

    it('sin el complemento no analiza ni gasta', async () => {
      const { body } = await asA(api().get('/restaurants/insights')).expect(200);

      expect(body).toEqual({ enabled: false, report: null, createdAt: null });
      await asA(api().post('/restaurants/insights')).expect(403);
      expect(parse).not.toHaveBeenCalled();
    });

    it('con el complemento guarda y devuelve el analisis', async () => {
      await enable();
      parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: report });

      await asA(api().post('/restaurants/insights')).expect(200);

      const { body } = await asA(api().get('/restaurants/insights'));
      expect(body).toMatchObject({ enabled: true, report });
    });

    it('nunca le envia a Claude datos de los clientes', async () => {
      await enable();
      await order();
      parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: report });

      await asA(api().post('/restaurants/insights')).expect(200);

      const sent = JSON.stringify(parse.mock.calls[0][0].messages);
      expect(sent).toContain('Arepa');
      expect(sent).not.toContain(CUSTOMER.phone);
      expect(sent).not.toContain('Ana');
    });

    it('limita los analisis por dia', async () => {
      await enable();
      parse.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: report });

      for (let i = 0; i < 3; i++) {
        await asA(api().post('/restaurants/insights')).expect(200);
      }

      await asA(api().post('/restaurants/insights')).expect(429);
    });
  });
});
