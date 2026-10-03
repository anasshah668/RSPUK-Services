const trim = (value) => String(value ?? "").trim();

const normalizeUrl = (value) =>
  trim(value).split("?")[0].toLowerCase();

const normalizeUrlList = (urls) => {
  if (!Array.isArray(urls)) return [];
  return [...new Set(urls.map(normalizeUrl).filter(Boolean))].sort();
};

const stableValue = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(stableValue).join(",");
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableValue(value[key])}`)
      .join("|");
  }
  return trim(value);
};

export function cartLineFingerprint(payload = {}) {
  return [
    trim(payload.id),
    trim(payload.type),
    trim(payload.designOption),
    normalizeUrlList(payload.fileUrls).join(","),
    normalizeUrl(payload.artworkPreviewUrl),
    trim(payload.deliveryOption),
    trim(payload.size),
    trim(payload.material),
    trim(payload.sidesPrinted),
    trim(payload.lamination),
    trim(payload.roundCorners),
    trim(payload.thirdPartyProductKey),
    stableValue(payload.selectedAttributes),
    stableValue(payload.selectionSnapshot),
    stableValue(payload.productOptions),
  ].join("::");
}

export function cartLinesMatch(left, right) {
  return cartLineFingerprint(left) === cartLineFingerprint(right);
}

export function shouldNeverMergeLine(payload = {}) {
  if (payload.type === "design-service") return false;
  if (payload.type === "custom-neon") return true;
  if (payload.designOption) return true;
  if (normalizeUrlList(payload.fileUrls).length > 0) return true;
  if (normalizeUrl(payload.artworkPreviewUrl)) return true;
  return false;
}
