import { createHash } from 'node:crypto';

// Mismo calculo que restaurantIdFor en el portal: el usuario siempre da el
// mismo ID, que es con el que el cliente encuentra el comercio por WhatsApp.
export function restaurantPublicId(username: string): string {
  const digest = createHash('sha256').update(username).digest('hex');
  return `PD-${digest.slice(0, 8).toUpperCase()}`;
}
