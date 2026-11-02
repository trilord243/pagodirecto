# PagoDirecto

Portal para que los comercios publiquen su menú y reciban pedidos, y un asistente de WhatsApp (agente de Claude) que toma esos pedidos, genera un QR de pago y lleva la tarjeta de fidelidad de cada cliente.

Monorepo con [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces):

```
.
├── apps/
│   ├── backend/    NestJS: API de restaurantes, pedidos y webhook de WhatsApp
│   └── frontend/   React + Vite: portal de comercios
├── compose.yaml    Postgres para desarrollo local
└── package.json    scripts que corren sobre ambas apps
```

| App | Stack | Puerto | Detalle |
| --- | --- | --- | --- |
| [`apps/frontend`](apps/frontend) | React 19, TypeScript, Vite | 5173 | [README](apps/frontend/README.md) |
| [`apps/backend`](apps/backend) | NestJS 12, Postgres, Claude Managed Agents | 3000 | [README](apps/backend/README.md) |

## Requisitos

- Node.js 22.9+ (CI usa 24, ver `.nvmrc`) y npm 10+
- Docker, para el Postgres local (o un Postgres propio en `DATABASE_URL`)

## Inicio rápido

```bash
npm install                                   # dependencias de ambas apps, desde la raíz
cp apps/backend/.env.example apps/backend/.env
npm run db:up                                 # Postgres en localhost:5432
npm run dev:backend                           # API en http://localhost:3000
npm run dev:frontend                          # portal en http://localhost:5173
```

Corre cada `dev:*` en su propia terminal. Nest crea las tablas al arrancar. En desarrollo Vite reenvía `/restaurants` y `/pedido` a la API, así que el portal no necesita configuración.

Para leer menús con IA o probar el chatbot hace falta `ANTHROPIC_API_KEY` en `apps/backend/.env`; el resto del portal funciona sin ella. Para tener comercios de prueba: `npm run build -w backend && npm run restaurants:seed -w backend` (imprime cada contraseña una sola vez).

## Scripts (desde la raíz)

| Comando | Qué hace |
| --- | --- |
| `npm run dev:frontend` | Vite en modo desarrollo |
| `npm run dev:backend` | NestJS en modo watch, con `apps/backend/.env` si existe |
| `npm run db:up` / `db:down` | Levanta o apaga el Postgres de `compose.yaml` |
| `npm run build` | Compila frontend y backend |
| `npm run lint` | oxlint en ambas apps |
| `npm test` | Tests unitarios (el backend usa PGlite en memoria, no necesita Postgres) |
| `npm run test:e2e` | Tests e2e del backend, contra el Postgres de `DATABASE_URL` |

Para una sola app: `npm run <script> -w frontend` o `-w backend`.

## Cómo funciona

```
Comercio ──> portal (React) ──> /restaurants/* (Nest) ──> Postgres
                                       │
Cliente ──> WhatsApp ──> Meta ──> /whatsapp/webhook (Nest) ──> agente de Claude
                                       │                           │
                                       └──── herramientas ◄────────┘
                                            (menú, pedido, QR, fidelidad)
```

- **Portal**: cada comercio entra con usuario y contraseña, sube fotos o PDF de su menú, revisa lo que Claude leyó y lo publica. Ve sus pedidos, su tarjeta de fidelidad, sus promociones y el panel PagoDirecto IQ. Cada comercio solo ve y toca lo suyo.
- **WhatsApp**: el webhook valida la firma de Meta y pasa cada mensaje a un agente de Claude Managed Agents, que toma pedidos con las herramientas de `apps/backend/src/restaurants/agent-tools.service.ts`. Cada pedido tiene un enlace público `/pedido/<token>` que abre el QR.
- **Montos**: los calcula siempre el backend. Se aplica una sola promoción, la mejor para el cliente, y una compra suma a la tarjeta cuando el comercio marca el pedido como pagado.

La API está documentada en [`apps/backend/README.md`](apps/backend/README.md).

## Variables de entorno

Todas están en [`apps/backend/.env.example`](apps/backend/.env.example) y [`apps/frontend/.env.example`](apps/frontend/.env.example). Ningún `.env` real se versiona.

## Despliegue

Los scripts de despliegue del servidor de producción viven en un repositorio privado aparte. Este repo solo contiene el código de las apps.
