import { DatabaseService } from './database/database.service.js';
import { WalletService } from './restaurants/wallet.service.js';

// Carga saldo de prueba: node dist/wallet-topup.js 58412... 50 USD
const [phone, amount, currency = 'USD'] = process.argv.slice(2);

if (!/^\d{10,15}$/.test(phone ?? '') || !(Number(amount) > 0)) {
  console.error('Uso: wallet-topup <telefono> <monto> [moneda]');
  process.exit(1);
}

const db = new DatabaseService();
await db.onModuleInit();
const balance = await new WalletService(db).credit(
  db,
  phone,
  currency,
  Number(amount),
  'topup',
);
console.log(`Saldo de ...${phone.slice(-4)}: ${balance} ${currency}`);
await db.onModuleDestroy();
