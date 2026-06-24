const trim = (value) => String(value ?? "").trim();

const DEFAULT_PARTNER_CONTACT_DETAILS = {
  firstName: "John",
  lastName: "Doe",
  email: "john@doe.com",
  contactPhone: "07655 568 134",
  companyName: "Tradeprint Distribution Ltd.",
};

const DEFAULT_BILLING_ADDRESS = {
  firstName: "Steeve",
  lastName: "Roucaute",
  add1: "Tradeprint Distribution Ltd",
  add2: "2 FULTON ROAD",
  postcode: "DD2 4SW",
  town: "DUNDEE",
  country: "GB",
  companyName: "TRADEPRINT DISTRIBUTION LTD",
  email: "steeve@tradeprint.co.uk",
  contactPhone: "0123456879",
  mobile: "0751424242",
};

const getPartnerContactDetails = () => ({
  firstName: trim(process.env.TRADEPRINT_PARTNER_FIRST_NAME) || DEFAULT_PARTNER_CONTACT_DETAILS.firstName,
  lastName: trim(process.env.TRADEPRINT_PARTNER_LAST_NAME) || DEFAULT_PARTNER_CONTACT_DETAILS.lastName,
  email: trim(process.env.TRADEPRINT_PARTNER_EMAIL) || DEFAULT_PARTNER_CONTACT_DETAILS.email,
  contactPhone: trim(process.env.TRADEPRINT_PARTNER_PHONE) || DEFAULT_PARTNER_CONTACT_DETAILS.contactPhone,
  companyName: trim(process.env.TRADEPRINT_PARTNER_COMPANY) || DEFAULT_PARTNER_CONTACT_DETAILS.companyName,
});

const getBillingAddress = () => ({
  firstName: trim(process.env.TRADEPRINT_BILLING_FIRST_NAME) || DEFAULT_BILLING_ADDRESS.firstName,
  lastName: trim(process.env.TRADEPRINT_BILLING_LAST_NAME) || DEFAULT_BILLING_ADDRESS.lastName,
  add1: trim(process.env.TRADEPRINT_BILLING_ADD1) || DEFAULT_BILLING_ADDRESS.add1,
  add2: trim(process.env.TRADEPRINT_BILLING_ADD2) || DEFAULT_BILLING_ADDRESS.add2,
  postcode: trim(process.env.TRADEPRINT_BILLING_POSTCODE) || DEFAULT_BILLING_ADDRESS.postcode,
  town: trim(process.env.TRADEPRINT_BILLING_TOWN) || DEFAULT_BILLING_ADDRESS.town,
  country: trim(process.env.TRADEPRINT_BILLING_COUNTRY) || DEFAULT_BILLING_ADDRESS.country,
  companyName: trim(process.env.TRADEPRINT_BILLING_COMPANY) || DEFAULT_BILLING_ADDRESS.companyName,
  email: trim(process.env.TRADEPRINT_BILLING_EMAIL) || DEFAULT_BILLING_ADDRESS.email,
  contactPhone: trim(process.env.TRADEPRINT_BILLING_PHONE) || DEFAULT_BILLING_ADDRESS.contactPhone,
  mobile: trim(process.env.TRADEPRINT_BILLING_MOBILE) || DEFAULT_BILLING_ADDRESS.mobile,
});

const splitCustomerName = (fullName) => {
  const parts = trim(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Customer",
    lastName: parts.slice(1).join(" ") || "Customer",
  };
};

const normalizeSelectedAttributesFromLineItem = (item) => {
  if (!item || typeof item !== "object") return {};

  if (
    item.selectedAttributes &&
    typeof item.selectedAttributes === "object" &&
    !Array.isArray(item.selectedAttributes)
  ) {
    return item.selectedAttributes;
  }

  const fromSnapshot =
    item.selectionSnapshot &&
    typeof item.selectionSnapshot === "object" &&
    !Array.isArray(item.selectionSnapshot) &&
    item.selectionSnapshot.attributes &&
    typeof item.selectionSnapshot.attributes === "object" &&
    !Array.isArray(item.selectionSnapshot.attributes)
      ? item.selectionSnapshot.attributes
      : null;
  if (fromSnapshot) return fromSnapshot;

  if (item.productionData && typeof item.productionData === "object" && !Array.isArray(item.productionData)) {
    return item.productionData;
  }

  if (Array.isArray(item.productOptions)) {
    const mapped = {};
    item.productOptions.forEach((row) => {
      const label = trim(row?.label);
      const value = row?.value;
      if (!label || value == null || trim(value) === "") return;
      mapped[label] = trim(value);
    });
    return mapped;
  }

  return {};
};

const getTradeprintServiceLevel = (item) => {
  const value = trim(
    item?.serviceLevel || item?.deliveryOption || item?.selectedAttributes?.deliveryOption || "",
  ).toLowerCase();
  if (value === "express") return "Express";
  if (value === "saver") return "Saver";
  return "Standard";
};

const getTradeprintFileUrls = (item) => {
  if (Array.isArray(item?.fileUrls)) {
    return item.fileUrls.filter((url) => /^https?:\/\//i.test(trim(url)));
  }
  if (/^https?:\/\//i.test(trim(item?.artworkPreviewUrl || ""))) {
    return [trim(item.artworkPreviewUrl)];
  }
  return [];
};

const getTradeprintProductionData = (item) => {
  const attributes = normalizeSelectedAttributesFromLineItem(item);
  const {
    deliveryOption: _deliveryOption,
    source: _source,
    ...productionData
  } = attributes || {};
  return productionData;
};

export const filterThirdPartyLines = (lineItems = []) =>
  (Array.isArray(lineItems) ? lineItems : []).filter((item) => {
    if (!item || typeof item !== "object") return false;
    if (trim(item.source) !== "third-party") return false;
    return Boolean(trim(item.thirdPartyProductKey || item.productId));
  });

export const buildTradeprintOrderPayload = ({
  lines,
  customerInfo = {},
  orderReference,
}) => {
  const customerName = splitCustomerName(customerInfo.name);
  const reference = trim(orderReference) || `CHECKOUT-${Date.now()}`;

  return {
    currency: "GBP",
    orderReference: reference,
    orderItems: lines.map((line, index) => {
      const productId = trim(line.thirdPartyProductKey || line.productId);
      if (!productId) {
        throw new Error(`Missing Tradeprint product id for item ${index + 1}.`);
      }

      const fileUrls = getTradeprintFileUrls(line);
      return {
        productId,
        fileUrls,
        withoutArtwork: fileUrls.length === 0,
        artworkService: "Just Print",
        quantity: Math.max(1, Number(line.quantity) || 1),
        serviceLevel: getTradeprintServiceLevel(line),
        productionData: getTradeprintProductionData(line),
        partnerContactDetails: getPartnerContactDetails(),
        deliveryAddress: {
          companyName: trim(customerInfo.name) || "Customer",
          firstName: customerName.firstName,
          lastName: customerName.lastName,
          add1: trim(customerInfo.address),
          add2: "",
          town: trim(customerInfo.city),
          postcode: trim(customerInfo.postalCode),
          country: "GB",
        },
        extraData: {
          description: trim(line.description || line.title || line.name) || "Order description",
          comments: "Please ensure not to trim into text",
          partnerItemId: trim(line.lineId || line.id) || `${reference}-${index + 1}`,
          merchandisingProductName: trim(line.title || line.name) || "Product",
          referenceLabel: trim(line.title || line.name) || reference,
          purchaseOrder: reference,
        },
      };
    }),
    billingAddress: getBillingAddress(),
  };
};
