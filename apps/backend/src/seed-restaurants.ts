import { randomBytes } from 'node:crypto';
import { DatabaseService } from './database/database.service.js';
import { hashPassword } from './restaurants/passwords.js';

// Crea los restaurantes de prueba que falten e imprime su contrasena una sola
// vez; solo se guarda el hash.
const RESTAURANTS = [
  { slug: 'arepera-prueba', name: 'Arepera de Prueba', username: 'arepera' },
  { slug: 'pizzeria-prueba', name: 'Pizzería de Prueba', username: 'pizzeria' },
];

const db = new DatabaseService();
await db.onModuleInit();

for (const restaurant of RESTAURANTS) {
  const password = randomBytes(12).toString('base64url');
  const { rows } = await db.query(
    `insert into restaurants (slug, name, username, password_hash)
     values ($1, $2, $3, $4)
     on conflict (username) do nothing
     returning id`,
    [
      restaurant.slug,
      restaurant.name,
      restaurant.username,
      await hashPassword(password),
    ],
  );
  if (rows[0]) {
    console.log(`${restaurant.username} ${password}`);
  }
}

await db.onModuleDestroy();
