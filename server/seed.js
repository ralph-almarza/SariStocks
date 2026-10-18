/**
 * CLI: seed the demo dataset.
 *
 *   node server/seed.js           → only seeds when no data files exist
 *   node server/seed.js --reset   → overwrites every collection with fresh demo data
 *
 * The server also auto-seeds on first run, so this script is mainly for
 * resetting the demo back to a clean state before a presentation.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Persistence } from './data/persistence.js';
import { makeSeedData, SEED_ACCOUNTS } from './data/seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const persistence = new Persistence(dataDir);
const reset = process.argv.includes('--reset');

if (!reset && persistence.exists('users')) {
  console.log('Data already exists. Run "npm run seed" (or node server/seed.js --reset) to overwrite with fresh demo data.');
  process.exit(0);
}

const seed = makeSeedData();
for (const [name, data] of Object.entries(seed)) persistence.save(name, data);

console.log(`Seeded into ${dataDir}:`);
console.log(`  ${seed.products.length} products in ${seed.categories.length} categories`);
console.log(`  ${seed.sales.length} sample sales over the last 14 days`);
console.log(`  ${seed.stock_movements.length} stock movements`);
console.log('Demo accounts:');
for (const account of SEED_ACCOUNTS) {
  console.log(`  ${account.role.padEnd(8)} ${account.username} / ${account.password}`);
}
