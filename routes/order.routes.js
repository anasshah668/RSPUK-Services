import express from 'express';
import Order from '../models/Order.js';
import { protect } from '../middleware/auth.js';
import { findCheckoutOrderByTrackingId } from '../services/checkoutOrdersStore.js';
import { buildShopOrderDetailFromPayload } from '../services/orderDetailSnapshot.js';
import { enrichTrackResponseWithTradeprint, cancelTradeprintOrderItem } from '../services/tradeprintOrderTracking.js';

const router = express.Router();

function getCheckoutLineItems(order) {
  const ctx = order?.checkoutContext && typeof order.checkoutContext === 'object'
    ? order.checkoutContext
    : {};
  const detail = order?.orderDetail && typeof order.orderDetail === 'object'
    ? order.orderDetail
    : {};
  return (
    (Array.isArray(ctx.lineItems) && ctx.lineItems.length ? ctx.lineItems : null) ||
    (Array.isArray(detail.lines) && detail.lines.length ? detail.lines : null) ||
    []
  );
}

function buildTrackItemsFromOrder(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.map((it) => ({
      productName: it.product?.name || 'Product',
      quantity: it.quantity,
      price: it.price,
      imageUrl: it.product?.productImage?.url || it.product?.images?.[0]?.url || null,
    }));
  }

  const lines = getCheckoutLineItems(order);
  if (lines.length > 0) {
    return lines.map((line, idx) => ({
      productName: String(line?.title || line?.name || `Item ${idx + 1}`),
      quantity: line?.quantity || 1,
      price: line?.price ?? null,
      imageUrl: line?.image || null,
    }));
  }

  const summary =
    order?.orderDetail?.orderSummary?.summary ||
    order?.checkoutContext?.orderDetails?.summary ||
    [];
  return (Array.isArray(summary) ? summary : []).map((row, idx) => ({
    productName: String(row?.label || `Item ${idx + 1}`),
    quantity: 1,
    price: null,
    note: String(row?.value || ''),
    imageUrl: null,
  }));
}

function buildMongoTrackResponse(order) {
  const ctx = order?.checkoutContext && typeof order.checkoutContext === 'object'
    ? order.checkoutContext
    : {};
  const orderReference =
    ctx.tradeprint?.orderReference ||
    ctx.orderReference ||
    null;
  const orderTitle =
    order?.orderDetail?.orderSummary?.title ||
    ctx.orderDetails?.title ||
    'Checkout order';

  return {
    trackingNumber: order.trackingNumber,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    total: order.total,
    currency: 'GBP',
    orderReference,
    orderTitle,
    paymentId: order.paymentId || null,
    items: buildTrackItemsFromOrder(order),
    shippingAddress: order.shippingAddress ? {
      city: order.shippingAddress.city,
      country: order.shippingAddress.country,
    } : null,
  };
}

async function resolveTrackingContext(trackingNumber) {
  const normalized = String(trackingNumber || '').trim().toUpperCase();
  if (!normalized) return null;

  const order = await Order.findOne({
    trackingNumber: {
      $regex: `^${String(trackingNumber).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      $options: 'i',
    },
  });

  if (order) {
    return {
      lineItems: getCheckoutLineItems(order),
      orderReference:
        order.checkoutContext?.tradeprint?.orderReference ||
        order.checkoutContext?.orderReference ||
        null,
    };
  }

  try {
    const checkoutRow = await findCheckoutOrderByTrackingId(normalized);
    if (!checkoutRow) return null;
    return {
      lineItems: Array.isArray(checkoutRow.lineItems) ? checkoutRow.lineItems : [],
      orderReference:
        checkoutRow.tradeprint?.orderReference || checkoutRow.orderReference || null,
    };
  } catch (fileErr) {
    console.warn('[orders] checkout JSON lookup failed', fileErr?.message || fileErr);
    return null;
  }
}

// @route   POST /api/orders
// @desc    Create new order
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    delete body.orderDetail;
    const orderDetail = buildShopOrderDetailFromPayload(body);

    const order = await Order.create({
      ...body,
      user: req.user._id,
      orderDetail,
    });

    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'name email')
      .populate('items.product');

    res.status(201).json(populatedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/orders
// @desc    Get user orders
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('items.product')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/orders/cancel-item
// @desc    Cancel a print partner order item before manufacturing
// @access  Public (tracking ID verification)
router.post('/cancel-item', async (req, res) => {
  try {
    const trackingNumber = String(req.body?.trackingNumber || '').trim();
    const itemReference = String(req.body?.itemReference || '').trim();

    if (!trackingNumber || !itemReference) {
      return res.status(400).json({
        success: false,
        errorMessage: 'Tracking number and item reference are required',
      });
    }

    const context = await resolveTrackingContext(trackingNumber);
    if (!context) {
      return res.status(404).json({
        success: false,
        errorMessage: 'Tracking number not found',
      });
    }

    const data = await cancelTradeprintOrderItem({
      orderReference: context.orderReference,
      itemReference,
      lineItems: context.lineItems,
    });

    if (!data.success) {
      return res.status(422).json({
        success: false,
        errorMessage: data.errorMessage || 'Cancellation failed',
        errorDetails: data.errorDetails || {},
      });
    }

    return res.json({
      success: true,
      result: data.result,
    });
  } catch (error) {
    res.status(500).json({ success: false, errorMessage: error.message });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns the order or is admin
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/orders/track/:trackingNumber
// @desc    Public tracking lookup by tracking number
// @access  Public
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const trackingNumber = String(req.params.trackingNumber || '').trim();
    const normalized = trackingNumber.toUpperCase();
    const order = await Order.findOne({
      trackingNumber: { $regex: `^${trackingNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    })
      .populate('items.product', 'name productImage images');

    if (order) {
      const lineItems = getCheckoutLineItems(order);
      const orderReference =
        order.checkoutContext?.tradeprint?.orderReference ||
        order.checkoutContext?.orderReference ||
        null;

      return res.json(
        await enrichTrackResponseWithTradeprint(buildMongoTrackResponse(order), {
          lineItems,
          orderReference,
        }),
      );
    }

    let checkoutRow = null;
    try {
      checkoutRow = await findCheckoutOrderByTrackingId(normalized);
    } catch (fileErr) {
      console.warn('[orders/track] checkout JSON lookup failed', fileErr?.message || fileErr);
    }
    if (!checkoutRow) {
      return res.status(404).json({ message: 'Tracking number not found' });
    }

    const summary = Array.isArray(checkoutRow.orderDetails?.summary)
      ? checkoutRow.orderDetails.summary
      : [];
    const itemsFromSummary = summary.map((row, idx) => ({
      productName: String(row?.label || `Item ${idx + 1}`),
      quantity: 1,
      price: null,
      note: String(row?.value || ''),
      imageUrl: null,
    }));

    const lineItems = Array.isArray(checkoutRow.lineItems) ? checkoutRow.lineItems : [];
    const orderReference =
      checkoutRow.tradeprint?.orderReference || checkoutRow.orderReference || null;

    const baseResponse = {
      trackingNumber: checkoutRow.trackingId,
      status: checkoutRow.adminStatus || 'waiting',
      createdAt: checkoutRow.createdAt,
      updatedAt: checkoutRow.adminStatusUpdatedAt || checkoutRow.createdAt,
      total: Number(checkoutRow.amount || 0),
      currency: checkoutRow.currency || 'GBP',
      orderTitle: checkoutRow.orderDetails?.title || 'Checkout order',
      orderReference,
      paymentId: checkoutRow.paymentId,
      items: itemsFromSummary,
      shippingAddress: {
        city: checkoutRow.customer?.city || '',
        country: 'GB',
      },
    };

    return res.json(
      await enrichTrackResponseWithTradeprint(baseResponse, {
        lineItems,
        orderReference,
      }),
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
