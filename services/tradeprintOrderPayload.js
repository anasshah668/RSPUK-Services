const trim = (value) => String(value ?? "").trim();

const DEFAULT_PARTNER_COMPANY = {
  companyName: "River Signs and Print",
  email: "Manager@riversigns.uk",
  contactPhone: "07727107037",
};

const DEFAULT_BILLING_ADDRESS = {
  firstName: "Youssef",
  lastName: "Hussein",
  add1: "Unit D2 Warelands Way Middlesbrough",
  add2: "Unit D2 Warelands Way Middlesbrough",
  postcode: "TS4 2JY",
  town: "Middlesbrough",
  country: "GB",
  companyName: "River Signs and Print",
  email: "Manager@riversigns.uk",
  contactPhone: "07727107037",
  mobile: "07727107037",
};

const UI_ONLY_ATTRIBUTE_LABELS = new Set([
  "material",
  "lamination",
  "round corners",
  "delivery option",
  "source",
]);

const normalizeCountryCode = (value, fallback = "GB") => {
  const raw = trim(value).toUpperCase();
  if (!raw) return fallback;
  if (raw === "ENGLAND" || raw === "UK" || raw === "UNITED KINGDOM") return "GB";
  if (raw.length === 2) return raw;
  return fallback;
};

const splitCustomerName = (fullName) => {
  const parts = trim(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Customer",
    lastName: parts.slice(1).join(" ") || "Customer",
  };
};

const getPartnerCompanyDefaults = () => ({
  companyName:
    trim(process.env.TRADEPRINT_PARTNER_COMPANY) || DEFAULT_PARTNER_COMPANY.companyName,
  email: trim(process.env.TRADEPRINT_PARTNER_EMAIL) || DEFAULT_PARTNER_COMPANY.email,
  contactPhone:
    trim(process.env.TRADEPRINT_PARTNER_PHONE) || DEFAULT_PARTNER_COMPANY.contactPhone,
});

const getPartnerContactDetails = (customerInfo = {}) => {
  const customerName = splitCustomerName(customerInfo.name);
  const companyDefaults = getPartnerCompanyDefaults();

  return {
    firstName: customerName.firstName,
    lastName: customerName.lastName,
    email: trim(customerInfo.email) || companyDefaults.email,
    contactPhone: trim(customerInfo.phone) || companyDefaults.contactPhone,
    companyName: companyDefaults.companyName,
  };
};

const getBillingAddress = () => ({
  firstName: trim(process.env.TRADEPRINT_BILLING_FIRST_NAME) || DEFAULT_BILLING_ADDRESS.firstName,
  lastName: trim(process.env.TRADEPRINT_BILLING_LAST_NAME) || DEFAULT_BILLING_ADDRESS.lastName,
  add1: trim(process.env.TRADEPRINT_BILLING_ADD1) || DEFAULT_BILLING_ADDRESS.add1,
  add2: trim(process.env.TRADEPRINT_BILLING_ADD2) || DEFAULT_BILLING_ADDRESS.add2,
  postcode: trim(process.env.TRADEPRINT_BILLING_POSTCODE) || DEFAULT_BILLING_ADDRESS.postcode,
  town: trim(process.env.TRADEPRINT_BILLING_TOWN) || DEFAULT_BILLING_ADDRESS.town,
  country: normalizeCountryCode(
    process.env.TRADEPRINT_BILLING_COUNTRY || DEFAULT_BILLING_ADDRESS.country,
  ),
  companyName: trim(process.env.TRADEPRINT_BILLING_COMPANY) || DEFAULT_BILLING_ADDRESS.companyName,
  email: trim(process.env.TRADEPRINT_BILLING_EMAIL) || DEFAULT_BILLING_ADDRESS.email,
  contactPhone: trim(process.env.TRADEPRINT_BILLING_PHONE) || DEFAULT_BILLING_ADDRESS.contactPhone,
  mobile: trim(process.env.TRADEPRINT_BILLING_MOBILE) || DEFAULT_BILLING_ADDRESS.mobile,
});

const isSlugLikeValue = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(trim(value));

export const normalizeSelectedAttributesFromLineItem = (item) => {
  if (!item || typeof item !== "object") return {};

  if (
    item.selectedAttributes &&
    typeof item.selectedAttributes === "object" &&
    !Array.isArray(item.selectedAttributes)
  ) {
    return { ...item.selectedAttributes };
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
  if (fromSnapshot) return { ...fromSnapshot };

  if (item.productionData && typeof item.productionData === "object" && !Array.isArray(item.productionData)) {
    return { ...item.productionData };
  }

  if (Array.isArray(item.productOptions)) {
    const mapped = {};
    item.productOptions.forEach((row) => {
      const label = trim(row?.label);
      const value = row?.value;
      if (!label || value == null || trim(value) === "") return;

      const labelKey = label.toLowerCase();
      if (UI_ONLY_ATTRIBUTE_LABELS.has(labelKey)) return;
      if (isSlugLikeValue(value)) return;

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
  const productionData = {};

  Object.entries(attributes || {}).forEach(([key, value]) => {
    const normalizedKey = trim(key);
    const normalizedValue = trim(value);
    if (!normalizedKey || !normalizedValue) return;
    if (UI_ONLY_ATTRIBUTE_LABELS.has(normalizedKey.toLowerCase())) return;
    if (normalizedKey.toLowerCase() === "deliveryoption") return;
    productionData[normalizedKey] = normalizedValue;
  });

  return productionData;
};

const buildExtraDataDescription = (line, productionData) => {
  const productName = trim(line.description || line.title || line.name) || "Product";
  const attributeSummary = Object.entries(productionData)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");

  if (attributeSummary) {
    return `${productName} — ${attributeSummary}`;
  }

  return productName;
};

const buildExtraData = ({ line, customerInfo, orderReference, index, productionData }) => {
  const productName = trim(line.title || line.name) || "Product";
  const reference = trim(orderReference) || `CHECKOUT-${Date.now()}`;
  const partnerItemId = trim(line.lineId || line.id) || `${reference}-${index + 1}`;

  return {
    description: buildExtraDataDescription(line, productionData),
    comments: trim(customerInfo.orderComments),
    partnerItemId,
    merchandisingProductName: productName,
    referenceLabel: `${reference} — ${productName}`,
    purchaseOrder: reference,
  };
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
      const productionData = getTradeprintProductionData(line);

      return {
        productId,
        fileUrls,
        withoutArtwork: fileUrls.length === 0,
        artworkService: trim(line.artworkService) || "Just Print",
        quantity: Math.max(1, Number(line.quantity) || 1),
        serviceLevel: getTradeprintServiceLevel(line),
        productionData,
        partnerContactDetails: getPartnerContactDetails(customerInfo),
        deliveryAddress: {
          companyName: trim(customerInfo.name) || "Customer",
          firstName: customerName.firstName,
          lastName: customerName.lastName,
          add1: trim(customerInfo.address),
          add2: trim(customerInfo.address2 || ""),
          town: trim(customerInfo.city),
          postcode: trim(customerInfo.postalCode),
          country: normalizeCountryCode(customerInfo.country, "GB"),
        },
        extraData: buildExtraData({
          line,
          customerInfo,
          orderReference: reference,
          index,
          productionData,
        }),
      };
    }),
    billingAddress: getBillingAddress(),
  };
};
