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
