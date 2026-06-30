import {
  cancelThirdPartyOrderItem,
  fetchThirdPartyOrderByReference,
} from "./thirdPartyAuth.service.js";

export const NON_CANCELLABLE_ITEM_STATUSES = new Set([
  "PrintingInProgress",
  "Shipped",
  "Cancelled",
]);

export function isOrderItemCancellable(status) {
  const value = String(status || "").trim();
  if (!value) return true;
  return !NON_CANCELLABLE_ITEM_STATUSES.has(value);
}

export function orderHasThirdPartyLines(lineItems) {
  return (
    Array.isArray(lineItems) &&
    lineItems.some((item) => String(item?.source || "").trim() === "third-party")
  );
}

function mapTradeprintItem(item) {
  const extra = item?.extraData && typeof item.extraData === "object" ? item.extraData : {};
  const status = item?.status || null;
  return {
    itemReference: item?.itemReference || null,
    description:
      extra.description ||
      extra.merchandisingProductName ||
      extra.referenceLabel ||
      "Print item",
    status,
    cancellable: isOrderItemCancellable(status),
    quantity: item?.quantity ?? null,
    serviceLevel: item?.serviceLevel || null,
    trackingNumber:
      item?.trackingNumber ||
      item?.tracking?.number ||
      item?.dispatchDetails?.trackingNumber ||
      null,
    carrier:
      item?.carrier ||
      item?.tracking?.carrier ||
      item?.dispatchDetails?.carrier ||
      null,
  };
}

function deriveDisplayStatus(tradeprintOrder) {
  const orderStatus = String(tradeprintOrder?.status || "").trim();
  const itemStatuses = (tradeprintOrder?.orderItems || [])
    .map((item) => String(item?.status || "").trim())
    .filter(Boolean);

  if (itemStatuses.some((s) => /dispatch|shipped|delivered/i.test(s))) {
    return "shipped";
  }
  if (itemStatuses.some((s) => /production|print/i.test(s))) {
    return "processing";
  }
  if (orderStatus) {
    return orderStatus.toLowerCase().replace(/\s+/g, "_");
  }
  return "processing";
}

export async function enrichTrackResponseWithTradeprint(
  baseResponse,
  { lineItems = [], orderReference } = {},
) {
  if (!orderHasThirdPartyLines(lineItems)) {
    return baseResponse;
  }

  const ref =
    String(orderReference || "").trim() ||
    String(baseResponse?.tradeprint?.orderReference || "").trim();

  if (!ref) {
    return {
      ...baseResponse,
      isTradeprintOrder: true,
      tradeprintError: "Print partner reference is not available yet",
    };
  }

  try {
    const data = await fetchThirdPartyOrderByReference(ref);
    if (!data.success) {
      return {
        ...baseResponse,
        isTradeprintOrder: true,
        tradeprintError: data.errorMessage || "Print order not found",
      };
    }

    const tp = data.result || {};
    const items = (tp.orderItems || []).map(mapTradeprintItem);

    return {
      ...baseResponse,
      isTradeprintOrder: true,
      status: deriveDisplayStatus(tp) || baseResponse.status,
      tradeprint: {
        orderReference: tp.orderReference || ref,
        status: tp.status || null,
        dateCreated: tp.dateCreated || null,
        orderNumber: tp.tpOrderDetails?.orderNumber || null,
        paymentState: tp.tpOrderDetails?.paymentState || null,
        items,
      },
    };
  } catch (error) {
    return {
      ...baseResponse,
      isTradeprintOrder: true,
      tradeprintError: error.message || "Failed to load print order status",
    };
  }
}

export async function cancelTradeprintOrderItem({
  orderReference,
  itemReference,
  lineItems = [],
} = {}) {
  if (!orderHasThirdPartyLines(lineItems)) {
    return {
      success: false,
      errorMessage: "This order does not include cancellable print items",
    };
  }

  const orderRef = String(orderReference || "").trim();
  const itemRef = String(itemReference || "").trim();
  if (!orderRef || !itemRef) {
    return {
      success: false,
      errorMessage: "Order reference and item reference are required",
    };
  }

  const live = await fetchThirdPartyOrderByReference(orderRef);
  if (!live.success) {
    return {
      success: false,
      errorMessage: live.errorMessage || "Print order not found",
      errorDetails: live.errorDetails || {},
    };
  }

  const items = Array.isArray(live.result?.orderItems) ? live.result.orderItems : [];
  const target = items.find(
    (row) => String(row?.itemReference || "").trim() === itemRef,
  );
  if (!target) {
    return {
      success: false,
      errorMessage: "Order item not found",
      errorDetails: {},
    };
  }

  if (!isOrderItemCancellable(target.status)) {
    return {
      success: false,
      errorMessage:
        "This item cannot be cancelled because it is already PrintingInProgress, Shipped, or Cancelled.",
      errorDetails: {},
    };
  }

  return cancelThirdPartyOrderItem(orderRef, itemRef);
}
