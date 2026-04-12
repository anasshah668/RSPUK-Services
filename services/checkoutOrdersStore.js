import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'checkout-orders.json');

const ensureFile = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(ORDERS_FILE, 'utf8');
  } catch {
    await writeFile(ORDERS_FILE, '[]', 'utf8');
  }
};

/**
 * Append a paid Worldpay checkout order for admin listing.
 * @param {Record<string, unknown>} order
 */
export async function recordCheckoutOrder(order) {
  await ensureFile();
  const raw = await readFile(ORDERS_FILE, 'utf8');
  let list = [];
  try {
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  const row = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...order,
  };
  list.unshift(row);
  await writeFile(ORDERS_FILE, JSON.stringify(list, null, 2), 'utf8');
  return row;
}

export async function listCheckoutOrders() {
  await ensureFile();
  const raw = await readFile(ORDERS_FILE, 'utf8');
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
