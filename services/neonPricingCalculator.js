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

export function selectionsComplete(input) {
  const w = String(input.width || '').trim();
  const h = String(input.height || '').trim();
  if (!w || !h) return false;
  if (input.environment !== 'indoor' && input.environment !== 'outdoor') return false;
  if (input.jacket !== 'coloured' && input.jacket !== 'white') return false;
  if (!['white', 'black', 'silver', 'yellow'].includes(String(input.backgroundColor || '').toLowerCase())) {
    return false;
  }
  if (!['none', 'heart', 'star'].includes(input.addOnShape)) return false;
  if (input.tubeThickness !== 'classic' && input.tubeThickness !== 'bold') return false;
  if (input.remoteDimmer !== 'yes' && input.remoteDimmer !== 'no') return false;
  if (input.powerMode !== 'battery-operated' && input.powerMode !== 'power-adaptor') return false;
  return true;
}

function sizeComponent(input, settings) {
  const w = String(input.width || '').trim();
  const h = String(input.height || '').trim();
  if (!w || !h) return 0;

  const preset = input.presetPrice != null ? Number(input.presetPrice) : NaN;
  if (!Number.isNaN(preset) && preset > 0) {
    return preset;
  }

  return (
    (settings.basePrice || 0) +
    parseDimensionToCm(input.width) * (settings.widthCmRate ?? 0) +
    parseDimensionToCm(input.height) * (settings.heightCmRate ?? 0)
  );
}

/** Adds only options the customer has already chosen (incremental pricing). */
function accumulateSelectedAddons(input, settings) {
  let price = 0;

  if (input.environment === 'outdoor') {
    price += settings.outdoorAddon ?? 0;
  }

  if (input.jacket === 'white') {
    price += settings.jacketWhiteAddon ?? 0;
  } else if (input.jacket === 'coloured') {
    price += settings.jacketColouredAddon ?? 0;
  }

  if (input.tubeThickness === 'classic') {
    price += settings.tubeClassicAddon ?? 0;
  } else if (input.tubeThickness === 'bold') {
    price += settings.tubeBoldAddon ?? 0;
  }

  if (input.remoteDimmer === 'yes') {
    price += settings.remoteDimmerYesAddon ?? 0;
  } else if (input.remoteDimmer === 'no') {
    price += settings.remoteDimmerNoAddon ?? 0;
  }

  if (input.powerMode === 'battery-operated') {
    price += settings.powerBatteryAddon ?? 0;
  } else if (input.powerMode === 'power-adaptor') {
    price += settings.powerAdaptorAddon ?? 0;
  }

  if (input.addOnShape === 'heart') {
    price += settings.addOnShapeHeartAddon ?? 0;
  } else if (input.addOnShape === 'star') {
    price += settings.addOnShapeStarAddon ?? 0;
  } else if (input.addOnShape === 'none') {
    price += settings.addOnShapeNoneAddon ?? 0;
  }

  const bg = String(input.backgroundColor || '').toLowerCase();
  const bgKey = {
    white: 'backgroundWhiteAddon',
    black: 'backgroundBlackAddon',
    silver: 'backgroundSilverAddon',
    yellow: 'backgroundYellowAddon',
  }[bg];
  if (bgKey) {
    price += settings[bgKey] ?? 0;
  }

  return price;
}

export function computeNeonPrice(input, settings) {
  const preset = input.presetPrice != null ? Number(input.presetPrice) : NaN;
  if (selectionsComplete(input) && !Number.isNaN(preset) && preset > 0) {
    return Number(preset.toFixed(2));
  }

  const size = sizeComponent(input, settings);
  const addons = accumulateSelectedAddons(input, settings);
  return Number((size + addons).toFixed(2));
}
