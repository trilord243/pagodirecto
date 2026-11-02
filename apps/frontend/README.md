# frontend

Portal de comercios de PagoDirecto: React 19 + TypeScript + Vite, sin librerías de UI ni router (ver `src/lib/route.ts`).

```bash
npm run dev       # http://localhost:5173, reenvía la API a http://localhost:3000
npm run build     # tsc -b && vite build -> dist/
npm run lint      # oxlint
npm run preview
```

Desde la raíz del monorepo: `npm run dev:frontend` o `npm run <script> -w frontend`.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `src/Portal.tsx` | Entrada del portal: sesión y secciones |
| `src/components/` | Vistas (menú, pedidos, fidelidad, promociones, asesor, IQ) y piezas compartidas |
| `src/lib/` | Cliente de la API (`api.ts`) y un módulo por recurso |

## Variables

`VITE_API_URL` (ver `.env.example`). Vacía, el portal llama a su mismo origen: en desarrollo el proxy de `vite.config.ts` la reenvía a Nest (`API_PROXY_TARGET` cambia el destino) y en producción el mismo dominio sirve portal y API.
