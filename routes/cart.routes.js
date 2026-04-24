import express from "express";
import { randomUUID } from "crypto";
import Cart from "../models/Cart.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

const trim = (value) => String(value ?? "").trim();

const formatLineForClient = (line) => {
  const payload =
    line.payload && typeof line.payload === "object" ? { ...line.payload } : {};
  const { quantity: _ignoredQty, lineId: _ignoredLine, ...rest } = payload;
  return {
    ...rest,
    lineId: line.lineId,
    quantity: line.quantity,
  };
};

async function getOrCreateCartForRequest(req) {
  if (req.user?._id) {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }
    return cart;
  }

  const guestClientId = trim(req.headers["x-client-id"]);
  if (!guestClientId || guestClientId.length < 8) {
    const err = new Error("CLIENT_ID_REQUIRED");
    err.status = 400;
    throw err;
  }

  let cart = await Cart.findOne({ guestClientId });
  if (!cart) {
    cart = await Cart.create({ guestClientId, items: [] });
  }
  return cart;
}

const withCart = async (req, res, next) => {
  try {
    req.cart = await getOrCreateCartForRequest(req);
    next();
  } catch (e) {
    if (e.message === "CLIENT_ID_REQUIRED") {
      return res.status(400).json({
        message:
          "X-Client-Id header is required for a guest basket. It is set automatically by the site once the browser storage is available.",
      });
    }
    next(e);
  }
};

router.use(optionalAuth);

router.post("/merge", protect, async (req, res) => {
  try {
    const guestClientId = trim(
      req.body?.guestClientId || req.headers["x-client-id"],
    );
    if (!guestClientId || guestClientId.length < 8) {
      return res.json({ merged: false, items: [] });
    }

    const guestCart = await Cart.findOne({ guestClientId });
    if (!guestCart || !guestCart.items.length) {
      return res.json({ merged: false, items: [] });
    }

    let userCart = await Cart.findOne({ user: req.user._id });
    if (!userCart) {
      userCart = new Cart({ user: req.user._id, items: [] });
    }

    for (const line of guestCart.items) {
      const pid = line.payload?.id != null ? String(line.payload.id) : null;
      if (!pid) {
        userCart.items.push({
          lineId: line.lineId || randomUUID(),
          payload: line.payload,
          quantity: line.quantity,
        });
        continue;
      }
      const existing = userCart.items.find(
        (i) => String(i.payload?.id) === pid,
      );
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        userCart.items.push({
          lineId: line.lineId || randomUUID(),
          payload: line.payload,
          quantity: line.quantity,
        });
      }
    }

    await userCart.save();
    await guestCart.deleteOne();

    res.json({
      merged: true,
      items: userCart.items.map(formatLineForClient),
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Cart merge failed" });
  }
});

router.get("/", withCart, async (req, res) => {
  res.json({ items: req.cart.items.map(formatLineForClient) });
});

router.delete("/", withCart, async (req, res) => {
  try {
    req.cart.items = [];
    await req.cart.save();
    res.json({ items: [] });
  } catch (error) {
    res
      .status(500)
      .json({ message: error.message || "Failed to clear basket" });
  }
});

router.post("/items", withCart, async (req, res) => {
  try {
    const { item, quantity } = req.body || {};
    if (
      !item ||
      typeof item !== "object" ||
      item.id == null ||
      String(item.id).trim() === ""
    ) {
      return res.status(400).json({ message: "item with id is required" });
    }

    const qty = Math.max(
      1,
      Math.floor(
        Number(
          quantity !== undefined && quantity !== null && quantity !== ""
            ? quantity
            : item?.quantity,
        ) || 1,
      ),
    );
    const cart = req.cart;
    const pid = String(item.id);

    const existing = cart.items.find((i) => String(i.payload?.id) === pid);
    if (existing) {
      existing.quantity += qty;
    } else {
      const payload =
        item && typeof item === "object" ? { ...item } : {};
      delete payload.quantity;
      cart.items.push({
        lineId: randomUUID(),
        payload,
        quantity: qty,
      });
    }

    await cart.save();
    res.json({ items: cart.items.map(formatLineForClient) });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to add item" });
  }
});

router.delete("/items/:lineId", withCart, async (req, res) => {
  try {
    const { lineId } = req.params;
    const cart = req.cart;
    cart.items = cart.items.filter((i) => i.lineId !== lineId);
    await cart.save();
    res.json({ items: cart.items.map(formatLineForClient) });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to remove item" });
  }
});

router.patch("/items/:lineId", withCart, async (req, res) => {
  try {
    const { lineId } = req.params;
    const quantity = Number(req.body?.quantity);
    const cart = req.cart;
    const line = cart.items.find((i) => i.lineId === lineId);
    if (!line) {
      return res.status(404).json({ message: "Basket line not found" });
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      cart.items = cart.items.filter((i) => i.lineId !== lineId);
    } else {
      line.quantity = Math.floor(quantity);
    }
    await cart.save();
    res.json({ items: cart.items.map(formatLineForClient) });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to update item" });
  }
});

export default router;
