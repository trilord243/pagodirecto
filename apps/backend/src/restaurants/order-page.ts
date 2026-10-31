import type { PublicOrder } from './orders.service.js';

export function formatMoney(amount: number, currency: string): string {
  const value = amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'VES' ? `Bs ${value}` : `$${value}`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const PAGE = (title: string, body: string) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#050b26">
<title>${title}</title>
<style>
  :root { --navy: #050b26; --pink: #ff0060; --text: #5b6280; --border: #e3e6f2; --success: #12a46b; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5fa; color: var(--text); font: 16px/1.5 system-ui, 'Segoe UI', Roboto, sans-serif; }
  header { background: var(--navy); color: #fff; padding: 28px 20px 72px; }
  header p, header h1 { max-width: 560px; margin: 0 auto; }
  header p { font-weight: 600; }
  header h1 { margin-top: 20px; font-size: 26px; line-height: 1.2; overflow-wrap: anywhere; }
  header .id { margin-top: 6px; font-size: 14px; color: #c7cce3; }
  main { max-width: 560px; margin: -48px auto 32px; padding: 24px 20px; background: #fff; border-radius: 20px; box-shadow: 0 12px 32px -12px rgba(5, 11, 38, .18); }
  @media (max-width: 600px) { main { margin: -48px 16px 24px; } }
  .meta { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: var(--navy); font-weight: 600; }
  .status { color: var(--pink); }
  .status.paid { color: var(--success); }
  table { width: 100%; margin-top: 16px; border-collapse: collapse; }
  th { padding: 8px 0; text-align: left; font-size: 14px; font-weight: 500; }
  td { padding: 12px 0; border-top: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
  .amount { padding-left: 16px; text-align: right; white-space: nowrap; }
  td.amount { color: var(--navy); font-weight: 600; }
  .name { color: var(--navy); font-weight: 600; }
  .unit { font-size: 14px; }
  .total { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 16px; border-top: 2px solid var(--navy); color: var(--navy); font-size: 22px; font-weight: 700; }
  .date { margin: 16px 0 0; font-size: 14px; }
</style>
</head>
<body>${body}</body>
</html>`;

export function renderOrderPage(order: PublicOrder): string {
  const money = (amount: number) => formatMoney(amount, order.currency);
  const paid = order.payment_status === 'paid';
  const rows = order.items
    .map(
      (item) => `<tr>
        <td><div class="name">${item.quantity} × ${escapeHtml(item.name)}</div>
        <div class="unit">${money(item.unit_price)} c/u</div></td>
        <td class="amount">${money(item.unit_price * item.quantity)}</td>
      </tr>`,
    )
    .join('');
  const date = new Date(order.created_at).toLocaleString('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  });

  return PAGE(
    `Pedido ${order.id}: ${escapeHtml(order.restaurant)}`,
    `<header>
      <p>PagoDirecto</p>
      <h1>${escapeHtml(order.restaurant)}</h1>
      <p class="id">ID del comercio: ${escapeHtml(order.restaurant_id)}</p>
    </header>
    <main>
      <div class="meta">
        <span>Pedido ${order.id}</span>
        <span class="status${paid ? ' paid' : ''}">${paid ? 'Pagado' : 'Pendiente de pago'}</span>
      </div>
      <table>
        <thead><tr><th scope="col">Producto</th><th scope="col" class="amount">Monto</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total"><span>Total</span><span>${money(order.total)}</span></div>
      <p class="date">${escapeHtml(date)}</p>
    </main>`,
  );
}

export const NOT_FOUND_PAGE = PAGE(
  'Pedido no encontrado',
  `<header><p>PagoDirecto</p><h1>Pedido no encontrado</h1></header>
  <main>Revisa el enlace o escanea de nuevo el código QR de tu pedido.</main>`,
);
