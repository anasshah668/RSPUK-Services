/**
 * Canonical fulfilment snapshot stored on Order.orderDetail (Mongo).
 * Holds every line the customer paid for plus order-level summary and customer contact.
 */

function plainLineFromShopItem(it) {
  if (!it || typeof it !== "object") return null;
  const o = typeof it.toObject === "function" ? it.toObject() : { ...it };
  const c = o.customization && typeof o.customization === "object" && !Array.isArray(o.customization)
    ? o.customization
    : {};
  const pick = (k) => (o[k] != null && o[k] !== "" ? o[k] : c[k]);
  const productRef =
    o.product && typeof o.product === "object" && o.product._id != null ? o.product._id : o.product;
  const productName =
    typeof o.product === "object" && o.product && o.product.name ? String(o.product.name) : undefined;

  return {
    id: o.id,
    lineId: o.lineId,
    product: productRef,
    name: pick("name") || productName,
    title: pick("title"),
    quantity: o.quantity,
    price: o.price,
    category: pick("category"),
    image: pick("image"),
    size: pick("size"),
    designOption: pick("designOption"),
    deliveryOption: pick("deliveryOption"),
    material: pick("material"),
    sidesPrinted: pick("sidesPrinted"),
    lamination: pick("lamination"),
    roundCorners: pick("roundCorners"),
    selectedAttributes: o.selectedAttributes || c.selectedAttributes,
    selectionSnapshot: o.selectionSnapshot || c.selectionSnapshot,
    variant: o.variant || c.variant,
    customization: Object.keys(c).length ? { ...c } : o.customization || undefined,
    options: o.options || c.options,
    productionData: o.productionData || c.productionData,
    summary: o.summary || c.summary,
    description: pick("description"),
    design: o.design,
    productType: pick("productType"),
    sku: pick("sku"),
    artworkAttached: pick("artworkAttached"),
    artworkPreviewUrl: pick("artworkPreviewUrl"),
    thirdPartyProductKey: pick("thirdPartyProductKey"),
    encryptedProductId: pick("encryptedProductId"),
    type: pick("type"),
  };
}

export function buildWorldpayOrderDetail({ lineItems, orderDetails, customer, source }) {
  const od = orderDetails && typeof orderDetails === "object" ? orderDetails : {};
  return {
    version: 1,
    source: source || "worldpay-checkout",
    capturedAt: new Date().toISOString(),
    customer:
      customer && typeof customer === "object"
        ? {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            city: customer.city,
            postalCode: customer.postalCode,
          }
        : undefined,
    orderSummary: {
      title: od.title,
      description: od.description,
      summary: Array.isArray(od.summary) ? od.summary : [],
    },
    lines: Array.isArray(lineItems) ? lineItems : [],
  };
}

/**
 * Build from shop checkout payload (items array and/or checkoutContext from Worldpay mirror).
 */
export function buildShopOrderDetailFromPayload(body) {
  const b = body && typeof body === "object" ? body : {};
  const items = Array.isArray(b.items) ? b.items : [];
  const ctx = b.checkoutContext && typeof b.checkoutContext === "object" ? b.checkoutContext : null;
  let lines = [];
  if (items.length) {
    lines = items.map(plainLineFromShopItem).filter(Boolean);
  } else if (ctx && Array.isArray(ctx.lineItems) && ctx.lineItems.length) {
    lines = ctx.lineItems;
  }
  return {
    version: 1,
    source: "shop",
    capturedAt: new Date().toISOString(),
    lines,
    globalInputs: b.globalInputs && typeof b.globalInputs === "object" ? b.globalInputs : undefined,
    checkoutContext: ctx || undefined,
    orderSummary:
      ctx?.orderDetails && typeof ctx.orderDetails === "object"
        ? {
            title: ctx.orderDetails.title,
            description: ctx.orderDetails.description,
            summary: Array.isArray(ctx.orderDetails.summary) ? ctx.orderDetails.summary : [],
          }
        : undefined,
  };
}
