function parseDimensionToCm(value) {
  if (value === undefined || value === null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const lower = raw.toLowerCase();
  const num = parseFloat(lower.replace(/[^\d.]/g, '')) || 0;
  if (lower.includes('ft')) return num * 30.48;
  if (lower.includes('mm')) return num / 10;
  return num;
}

export function computeNeonPrice(input, settings) {
  const preset = input.presetPrice != null ? Number(input.presetPrice) : NaN;
  if (!Number.isNaN(preset) && preset > 0) {
    return Math.max(settings.minimumPrice || 10, Number(preset.toFixed(2)));
  }

  const widthCm = parseDimensionToCm(input.width);
  const heightCm = parseDimensionToCm(input.height);

  let price =
    (settings.basePrice || 0) +
    widthCm * (settings.widthCmRate ?? 0) +
    heightCm * (settings.heightCmRate ?? 0);

  if (input.environment === 'outdoor') {
    price += settings.outdoorAddon ?? 0;
  }

  if (input.jacket === 'white') {
    price += settings.jacketWhiteAddon ?? 0;
  } else {
    price += settings.jacketColouredAddon ?? 0;
  }

  if (input.tubeThickness === 'classic') {
    price += settings.tubeClassicAddon ?? 0;
  } else {
    price += settings.tubeBoldAddon ?? 0;
  }

  if (input.remoteDimmer === 'yes') {
    price += settings.remoteDimmerYesAddon ?? 0;
  } else {
    price += settings.remoteDimmerNoAddon ?? 0;
  }

  if (input.powerMode === 'battery-operated') {
    price += settings.powerBatteryAddon ?? 0;
  } else {
    price += settings.powerAdaptorAddon ?? 0;
  }

  if (input.addOnShape === 'heart') {
    price += settings.addOnShapeHeartAddon ?? 0;
  } else if (input.addOnShape === 'star') {
    price += settings.addOnShapeStarAddon ?? 0;
  } else {
    price += settings.addOnShapeNoneAddon ?? 0;
  }

  const bg = String(input.backgroundColor || 'white').toLowerCase();
  const bgKey = {
    white: 'backgroundWhiteAddon',
    black: 'backgroundBlackAddon',
    silver: 'backgroundSilverAddon',
    yellow: 'backgroundYellowAddon',
  }[bg];
  if (bgKey) {
    price += settings[bgKey] ?? 0;
  }

  const minP = settings.minimumPrice ?? 10;
  return Math.max(minP, Number(price.toFixed(2)));
}
