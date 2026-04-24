import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'checkout-orders.json');
const TRACK_PREFIX = 'RSP';

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
  const now = new Date().toISOString();
  const trackingId =
    String(order?.trackingId || '').trim() || createUniqueTrackingId(list);
  const row = {
    id: randomUUID(),
    createdAt: now,
    adminStatus: String(order?.adminStatus || '').trim().toLowerCase() || 'waiting',
    adminStatusUpdatedAt: now,
    trackingId,
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

const ADMIN_STATUSES = new Set([
  'waiting',
  'inprocess',
  'completed',
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);

function createUniqueTrackingId(list) {
  const existing = new Set((Array.isArray(list) ? list : []).map((r) => String(r?.trackingId || '')));
  let id = '';
  do {
    const randomPart = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    id = `${TRACK_PREFIX}-${new Date().getFullYear()}-${randomPart}`;
  } while (existing.has(id));
  return id;
}

/**
 * Shape checkout JSON rows for admin list/detail (aligned with shop orders where possible).
 */
export function normalizeCheckoutRowForAdmin(row) {
  if (!row || typeof row !== 'object') return null;
  let status = row.adminStatus;
  if (!ADMIN_STATUSES.has(status)) status = 'waiting';
  return {
    _id: row.id,
    orderKind: 'checkout',
    createdAt: row.createdAt,
    updatedAt: row.adminStatusUpdatedAt || row.createdAt,
    status,
    paymentStatus: 'paid',
    total: row.amount,
    currency: row.currency || 'GBP',
    user: row.userId ? { _id: row.userId, name: null, email: null } : null,
    customer: row.customer,
    orderDetails: row.orderDetails,
    /** Full basket / product selections (sanitized at persist time). */
    lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
    orderReference: row.orderReference,
    trackingNumber: row.trackingId,
    trackingId: row.trackingId,
    paymentId: row.paymentId,
    worldpay: row.worldpay,
    source: row.source,
  };
}

export async function updateCheckoutOrderStatus(orderId, status) {
  const normalized = String(status || '').toLowerCase();
  if (!ADMIN_STATUSES.has(normalized)) {
    throw new Error('Invalid status');
  }
  await ensureFile();
  const raw = await readFile(ORDERS_FILE, 'utf8');
  let list = [];
  try {
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  const idx = list.findIndex((o) => o && o.id === orderId);
  if (idx === -1) return null;
  list[idx].adminStatus = normalized;
  list[idx].adminStatusUpdatedAt = new Date().toISOString();
  await writeFile(ORDERS_FILE, JSON.stringify(list, null, 2), 'utf8');
  return list[idx];
}

export async function findCheckoutOrderByTrackingId(trackingId) {
  const needle = String(trackingId || '').trim().toUpperCase();
  if (!needle) return null;
  const rows = await listCheckoutOrders();
  const found = rows.find((row) => String(row?.trackingId || '').trim().toUpperCase() === needle);
  return found || null;
}
