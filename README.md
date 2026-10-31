# pagodirecto

Monorepo con npm workspaces:

| App | Stack | Carpeta | Puerto |
| --- | --- | --- | --- |
| Frontend | React + TypeScript (Vite) | `apps/frontend` | 5173 |
| Backend | NestJS | `apps/backend` | 3000 |

## Requisitos

- Node.js 20+ (probado con v25)
- npm 10+

## Inicio rápido

```bash
npm install            # instala las dependencias de ambas apps desde la raíz
npm run dev:backend    # API en http://localhost:3000
npm run dev:frontend   # UI en http://localhost:5173
```

Corre cada `dev:*` en su propia terminal.

## Scripts (desde la raíz)

| Comando | Qué hace |
| --- | --- |
| `npm run dev:frontend` | Vite en modo desarrollo |
| `npm run dev:backend` | NestJS en modo watch |
| `npm run build` | Compila frontend y backend |
| `npm test` | Corre los tests de las apps que los tengan |

Para correr un script en una sola app: `npm run <script> -w frontend` o `-w backend`.

## Restaurantes

Cada restaurante entra con su usuario y contraseña, sube la foto de su menú y confirma lo que Claude leyó. Desde ahí, los clientes piden por WhatsApp. Cada restaurante solo ve y toca lo suyo.

API en `https://api.example.com/restaurants`. Salvo el login, todo requiere `Authorization: Bearer <token>`:

| Método y ruta | Qué hace |
| --- | --- |
| `POST /auth/login` | Recibe `username` y `password`, devuelve `token` (dura 7 días) |
| `POST /auth/logout` | Invalida el token |
| `GET /me` | Datos del restaurante |
| `POST /menu/analyze` | Recibe la imagen en el campo `image` (multipart, JPG, PNG o WebP, hasta 5 MB) y devuelve lo leído **sin guardar nada** |
| `POST /menu/confirm` | Recibe `{ currency?, items: [{ name, description?, category?, price }] }`. Guarda por nombre: actualiza los platos que ya existen y agrega los nuevos |
| `GET /menu/items` | Lista el menú |
| `POST /menu/items` | Agrega un plato |
| `PATCH /menu/items/:id` | Edita un plato o su disponibilidad con `available` |
| `DELETE /menu/items/:id` | Borra un plato |
| `GET /orders` | Últimos 200 pedidos, con el teléfono del cliente |
| `PATCH /orders/:id` | Cambia `status`: `pending`, `confirmed`, `ready`, `delivered` o `cancelled` |

Los restaurantes de prueba se crean con `dist/seed-restaurants.js`, que imprime cada contraseña una sola vez. En el VPS quedan en `/opt/pagodirecto/restaurantes-prueba.txt`.

## Chatbot de WhatsApp

`apps/backend/src/whatsapp` recibe el webhook de Meta y conversa con un agente de Claude Managed Agents, que toma pedidos con las herramientas de `src/restaurants/agent-tools.service.ts`:

```
WhatsApp -> Meta -> Odoo (odoo.example.com/whatsapp/webhook)
                      └─ copia por nginx -> Nest (VPS) -> agente de Claude -> Graph API
```

Usa el número y las credenciales de Odoo. El webhook de Meta sigue apuntando a Odoo y Nest solo recibe una copia (`deploy/nginx-whatsapp-espejo.conf`), así que Odoo no depende de Nest. `WHATSAPP_ALLOWED_NUMBERS` decide quién llega a Claude: una lista de números, `*` para todos o vacío para nadie. Las respuestas del agente salen directo por Graph API y no aparecen en el chat de Odoo.

Antes de responder, Nest lee en Odoo el estado del chat (`discuss_channel.stv_bot_state`) con un usuario de Postgres de solo lectura. Claude responde en chats nuevos o en espera, se calla si un asesor escribió en las últimas `WHATSAPP_HUMAN_HOURS` horas o si el chat está apagado, y no responde si no puede leer el estado.

El bot anterior de Odoo (`odoo_whatsapp_bot`) está apagado con el parámetro `odoo_wa_bot.enabled`, en Ajustes de Odoo. Sigue instalado: marca los chats que atiende un asesor, pero ya no saluda, no avisa a los asesores y no registra encuestas.

- Variables de entorno: `apps/backend/.env.example`. En el VPS viven en `/opt/pagodirecto/.env`.
- La definición del agente está en `src/whatsapp/agent-definition.ts`. Para crearlo o publicar cambios, en el VPS: `cd /opt/pagodirecto/app/apps/backend && /opt/pagodirecto/node/bin/node --env-file=/opt/pagodirecto/.env dist/setup-agent.js`.
- Desplegar: `bash deploy/deploy.sh` (compila localmente y sube el resultado).
- Estado en el VPS: `curl http://127.0.0.1:3000/whatsapp/health` y `journalctl -u pagodirecto -f`.
