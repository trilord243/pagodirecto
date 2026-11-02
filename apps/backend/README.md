# backend

API de PagoDirecto en NestJS 12 (ESM): restaurantes, menús, pedidos, fidelidad y el webhook de WhatsApp con un agente de Claude Managed Agents. Guarda todo en Postgres; las tablas las crea `src/database/schema.ts` al arrancar.

```bash
cp .env.example .env
npm run start:dev          # http://localhost:3000, carga .env si existe
npm test                   # vitest con PGlite en memoria
npm run test:e2e           # contra el Postgres de DATABASE_URL
npm run lint               # oxlint
npm run build              # -> dist/
```

Desde la raíz del monorepo: `npm run dev:backend` o `npm run <script> -w backend`.

Utilidades (después de `npm run build`):

| Comando | Qué hace |
| --- | --- |
| `npm run agent:setup` | Crea o actualiza el agente de Claude e imprime `CLAUDE_AGENT_ID` y `CLAUDE_ENVIRONMENT_ID` |
| `npm run restaurants:seed` | Crea los comercios de prueba que falten e imprime cada contraseña una sola vez |
| `npm run wallet:topup -- <telefono> <monto> [moneda]` | Carga saldo de prueba a la billetera de un cliente |

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/database/` | Pool de Postgres y esquema |
| `src/restaurants/` | Auth de comercios, menú (y su lectura con Claude), pedidos, fidelidad, promociones, IQ, billetera y las herramientas del agente |
| `src/whatsapp/` | Webhook de Meta, conversación con el agente, Graph API y el control opcional contra Odoo |

## API

Base `/restaurants`. Salvo login y registro, todo requiere `Authorization: Bearer <token>`.

| Método y ruta | Qué hace |
| --- | --- |
| `POST /auth/login` | Recibe `username` y `password`, devuelve `token` (dura 7 días) |
| `POST /auth/register` | Afilia un comercio con `name` (nombre del negocio), `username` y `password`, sin verificación. Crea su ID y devuelve lo mismo que el login |
| `POST /auth/logout` | Invalida el token |
| `GET /me` | Datos del restaurante |
| `GET /menu` | Menú completo por categorías |
| `PUT /menu` | Publica el menú completo `{ currency, categories: [{ name, items: [{ name, description?, price, available? }] }] }`: lo que no venga se borra. `currency` es `USD` o `VES` |
| `POST /menu/analyze` | Recibe hasta 5 archivos en el campo `files` (multipart, PDF, JPG, PNG o WebP, hasta 10 MB cada uno) y devuelve lo leído **sin guardar nada**, con `reviewReason` en lo dudoso |
| `GET /menu/items` | Lista el menú |
| `POST /menu/items` | Agrega un plato |
| `PATCH /menu/items/:id` | Edita un plato o su disponibilidad con `available` |
| `DELETE /menu/items/:id` | Borra un plato |
| `GET /loyalty` y `PUT /loyalty` | Tarjeta de fidelidad del comercio (`stampsRequired`, `rewardItemId`, `active`) y sus clientes |
| `GET, POST /promotions` y `PATCH, DELETE /promotions/:id` | Promociones por porcentaje, con `minPurchases` y `minTotal` opcionales |
| `GET, POST /insights` | Asesor de negocio con IA. Complemento que se activa con `restaurants.insights_enabled` |
| `GET /iq?mode=demo` o `mode=real` | PagoDirecto IQ: panel de ventas, clientes y comparación anónima. `demo` son cifras de ejemplo con los platos del comercio; `real` exige el plan activo |
| `GET /orders` | Últimos 200 pedidos, con el teléfono del cliente |
| `PATCH /orders/:id` | Cambia `status` (`pending`, `confirmed`, `ready`, `delivered`, `cancelled`) o `paymentStatus` (`pending`, `paid`) |

Cada comercio tiene un ID `PD-XXXXXXXX` que sale del usuario. Cada pedido tiene un enlace público `/pedido/<token>`, que es lo que abre el QR: muestra el comercio, los ítems con sus montos y el total, sin datos del cliente. Con `Accept: application/json` devuelve lo mismo en JSON.

## WhatsApp

`GET /whatsapp/webhook` responde la verificación de Meta con `WHATSAPP_VERIFY_TOKEN` y `POST /whatsapp/webhook` recibe los mensajes, validando la firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`. Las respuestas salen por Graph API.

- `WHATSAPP_ALLOWED_NUMBERS` decide quién llega a Claude: una lista de números, `*` para todos o vacío para nadie.
- `WHATSAPP_MAX_MESSAGES_PER_HOUR` limita a cada número.
- Con `WHATSAPP_ODOO_GUARD=true`, antes de responder lee en el Postgres de Odoo, con un usuario de solo lectura, si un asesor atiende el chat (`discuss_channel.stv_bot_state`). Claude se calla si un asesor escribió en las últimas `WHATSAPP_HUMAN_HOURS` horas y no responde si no puede leer el estado. En local va en `false`.
- La definición del agente (prompt y herramientas) está en `src/whatsapp/agent-definition.ts`; `npm run agent:setup` publica los cambios.
- `GET /whatsapp/health` informa qué credenciales están configuradas, sin mostrarlas. No debe exponerse públicamente.
