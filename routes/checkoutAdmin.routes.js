import express from 'express';
import { listCheckoutOrders } from '../services/checkoutOrdersStore.js';

const router = express.Router();

const trim = (value) => String(value ?? '').trim();

/**
 * Paid checkout orders (Worldpay) persisted on the server.
 * Mount with: app.use('/api', checkoutAdminRouter)
 * Admin UI: merge these with your main GET /admin/orders response in the Orders tab.
 *
 * Optional guard: set CHECKOUT_ORDERS_ADMIN_TOKEN and send header x-checkout-orders-token.
 */
router.get('/admin/orders-from-checkout', async (req, res) => {
  try {
    const expected = trim(process.env.CHECKOUT_ORDERS_ADMIN_TOKEN);
    if (expected) {
      const sent = trim(req.headers['x-checkout-orders-token']);
      if (sent !== expected) {
        return res.status(401).json({ message: 'Invalid or missing checkout orders token' });
      }
    }
    const orders = await listCheckoutOrders();
    res.json({ orders, source: 'worldpay-checkout' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to list checkout orders' });
  }
});

export default router;
