import { fetchThirdPartyOrderByReference } from "./thirdPartyAuth.service.js";

export function orderHasThirdPartyLines(lineItems) {
  return (
    Array.isArray(lineItems) &&
    lineItems.some((item) => String(item?.source || "").trim() === "third-party")
  );
}

function mapTradeprintItem(item) {
  const extra = item?.extraData && typeof item.extraData === "object" ? item.extraData : {};
  return {
    description:
      extra.description ||
      extra.merchandisingProductName ||
      extra.referenceLabel ||
      "Print item",
    status: item?.status || null,
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
      tradeprintError: "Tradeprint order reference is not available yet",
    };
  }

  try {
    const data = await fetchThirdPartyOrderByReference(ref);
    if (!data.success) {
      return {
        ...baseResponse,
        isTradeprintOrder: true,
        tradeprintError: data.errorMessage || "Tradeprint order not found",
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
      tradeprintError: error.message || "Failed to load Tradeprint tracking",
    };
  }
}
