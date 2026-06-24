import {
  buildTradeprintOrderPayload,
  filterThirdPartyLines,
} from "./tradeprintOrderPayload.js";
import {
  placeThirdPartyOrder,
  validateThirdPartyOrder,
} from "./thirdPartyAuth.service.js";

/**
 * Validate then place a Tradeprint order for third-party checkout lines.
 * Used after successful Worldpay payment.
 */
export const fulfillTradeprintCheckoutOrder = async ({
  lineItems = [],
  customerInfo = {},
  orderReference,
} = {}) => {
  const lines = filterThirdPartyLines(lineItems);
  if (lines.length === 0) {
    return { skipped: true, reason: "no_third_party_lines" };
  }

  const payload = buildTradeprintOrderPayload({
    lines,
    customerInfo,
    orderReference,
  });

  const validation = await validateThirdPartyOrder(payload);
  if (!validation.success) {
    return {
      success: false,
      stage: "validation",
      errorMessage:
        validation.errorMessage || validation.message || "Tradeprint validation failed",
      errorDetails: Array.isArray(validation.errorDetails)
        ? validation.errorDetails
        : [],
      payload,
    };
  }

  const placement = await placeThirdPartyOrder(payload);
  if (!placement.success) {
    return {
      success: false,
      stage: "placement",
      errorMessage:
        placement.errorMessage || placement.message || "Tradeprint order placement failed",
      errorDetails: Array.isArray(placement.errorDetails)
        ? placement.errorDetails
        : [],
      payload,
    };
  }

  const order = placement.result?.order || placement.result || {};
  return {
    success: true,
    stage: "placed",
    orderReference: order.orderReference || orderReference,
    tradeprintOrder: order,
    result: placement.result,
    payload,
  };
};
