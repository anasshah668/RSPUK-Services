/**
 * Server-side featured signage price calculator.
 * All amounts are ex-VAT (net) unless the client applies VAT for display.
 */

function parseDimensionToCm(value, unit) {
  if (value === undefined || value === null) return 0;
  const num = parseFloat(String(value).replace(/[^\d.]/g, '')) || 0;
  if (num <= 0) return 0;
  const u = String(unit || 'mm').toLowerCase();
  if (u === 'ft' || u === 'feet') return num * 30.48;
  if (u === 'inch' || u === 'in') return num * 2.54;
  if (u === 'm' || u === 'meter' || u === 'metre') return num * 100;
  return num / 10; // mm → cm
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function addon(settings, key) {
  return Number(settings?.[key]) || 0;
}

function sizeComponent(width, height, unit, settings) {
  const w = parseDimensionToCm(width, unit);
  const h = parseDimensionToCm(height, unit);
  if (w <= 0 || h <= 0) return 0;

  const base = addon(settings, 'basePrice');
  const areaRate = addon(settings, 'areaCm2Rate');
  if (areaRate > 0) {
    return base + w * h * areaRate;
  }
  return base + w * addon(settings, 'widthCmRate') + h * addon(settings, 'heightCmRate');
}

function globalAddons(input, settings, lines) {
  let total = 0;
  if (input.usage === 'outdoor') {
    const v = addon(settings, 'outdoorAddon');
    if (v) lines.push({ label: 'Outdoor usage', amount: v });
    total += v;
  }
  if (input.installationRequired === true || input.installationRequired === 'yes') {
    const v = addon(settings, 'installationAddon');
    if (v) lines.push({ label: 'Installation', amount: v });
    total += v;
  }
  if (input.deliveryRequired === true || input.deliveryRequired === 'yes') {
    const v = addon(settings, 'deliveryAddon');
    if (v) lines.push({ label: 'Delivery', amount: v });
    total += v;
  }
  if (input.rushOrder === true || input.rushOrder === 'yes') {
    const v = addon(settings, 'rushOrderAddon');
    if (v) lines.push({ label: 'Rush order', amount: v });
    total += v;
  }
  if (input.designServiceRequired === true || input.designServiceRequired === 'yes') {
    const v = addon(settings, 'designServiceAddon');
    if (v) lines.push({ label: 'Design service', amount: v });
    total += v;
  }
  return total;
}

function productAddons(categorySlug, productSpecific, settings, lines) {
  const ps = productSpecific || {};
  let total = 0;
  const slug = String(categorySlug || '').toLowerCase();

  const addKeyed = (key, label) => {
    const v = addon(settings, key);
    if (v) {
      lines.push({ label, amount: v });
      total += v;
    }
  };

  switch (slug) {
    case '3d-built-up-letters': {
      const letters = Math.max(0, parseInt(String(ps.numberOfLetters || ''), 10) || 0);
      if (letters > 0) {
        const per = addon(settings, 'letterUnitAddon');
        const letterTotal = per * letters;
        if (letterTotal) lines.push({ label: `Letters (${letters} × £${per})`, amount: letterTotal });
        total += letterTotal;
      }
      const lh = parseDimensionToCm(ps.letterHeight, 'mm');
      if (lh > 0) {
        const rate = addon(settings, 'letterHeightCmRate');
        const lhTotal = lh * rate;
        if (lhTotal) lines.push({ label: 'Letter height', amount: lhTotal });
        total += lhTotal;
      }
      if (ps.material === 'metal') addKeyed('material_metal', 'Material: Metal');
      else if (ps.material === 'aluminum') addKeyed('material_aluminum', 'Material: Aluminum');
      if (ps.lightingType === 'backlit') addKeyed('lightingType_backlit', 'Lighting: Backlit');
      else if (ps.lightingType === 'halo') addKeyed('lightingType_halo', 'Lighting: Halo');
      else if (ps.lightingType === 'none') addKeyed('lightingType_none', 'Lighting: None');
      if (ps.ledColor === 'rgb') addKeyed('ledColor_rgb', 'LED: RGB');
      else if (ps.ledColor === 'warm') addKeyed('ledColor_warm', 'LED: Warm');
      if (ps.mountingType === 'raceway') addKeyed('mountingType_raceway', 'Mounting: Raceway');
      else if (ps.mountingType === 'hanging') addKeyed('mountingType_hanging', 'Mounting: Hanging');
      break;
    }
    case '2d-box-signage':
      if (ps.lighting === 'yes') addKeyed('lighting_yes', 'Lighting');
      if (ps.sided === 'double-sided') addKeyed('sided_double-sided', 'Double-sided');
      if (ps.frameMaterial === 'ms') addKeyed('frameMaterial_ms', 'Frame: MS');
      if (ps.faceMaterial === 'flex') addKeyed('faceMaterial_flex', 'Face: Flex');
      if (ps.mountingType === 'pole') addKeyed('mountingType_pole', 'Mounting: Pole');
      else if (ps.mountingType === 'hanging') addKeyed('mountingType_hanging', 'Mounting: Hanging');
      break;
    case 'flex-face':
      if (ps.flexType === 'backlit') addKeyed('flexType_backlit', 'Flex: Backlit');
      if (ps.frameIncluded === 'yes') addKeyed('frameIncluded_yes', 'Frame included');
      if (ps.printingType === 'eco-solvent') addKeyed('printingType_eco-solvent', 'Printing: Eco Solvent');
      if (ps.lighting === 'yes') addKeyed('lighting_yes', 'Lighting');
      break;
    case 'lightbox':
      if (ps.brightnessLevel === 'high') addKeyed('brightnessLevel_high', 'Brightness: High');
      if (ps.frameType === 'acrylic' || ps.lightboxFrameType === 'acrylic') {
        addKeyed('lightboxFrameType_acrylic', 'Frame: Acrylic');
      }
      if (ps.faceMaterial === 'fabric') addKeyed('faceMaterial_fabric', 'Face: Fabric');
      break;
    case 'printed-board':
      if (ps.boardType === 'pvc') addKeyed('boardType_pvc', 'Board: PVC');
      else if (ps.boardType === 'acrylic') addKeyed('boardType_acrylic', 'Board: Acrylic');
      if (ps.lamination === 'yes') addKeyed('lamination_yes', 'Lamination');
      if (ps.finish === 'gloss') addKeyed('finish_gloss', 'Finish: Gloss');
      break;
    default:
      break;
  }
  return total;
}

export function featuredRequirementsComplete(input) {
  const w = String(input?.width ?? '').trim();
  const h = String(input?.height ?? '').trim();
  const q = Number(input?.quantity);
  return Boolean(w && h && Number.isFinite(q) && q >= 1);
}

/**
 * @param {object} input - categorySlug, width, height, unit, quantity, usage, flags, productSpecific
 * @param {object} settings - admin rates for category (or _default fallback)
 */
export function computeFeaturedSignagePrice(input, settings) {
  const lines = [];
  const quantity = Math.max(1, Math.floor(Number(input?.quantity) || 1));

  if (!featuredRequirementsComplete(input)) {
    return {
      unitPrice: 0,
      quantity,
      subtotal: 0,
      total: 0,
      currency: settings?.currency || 'GBP',
      complete: false,
      breakdown: lines,
    };
  }

  const size = sizeComponent(input.width, input.height, input.unit, settings);
  if (size > 0) {
    const areaRate = addon(settings, 'areaCm2Rate');
    lines.push({
      label: areaRate > 0 ? 'Base + size (area)' : 'Base + size (width & height)',
      amount: size,
    });
  }

  let unitPrice = size;
  unitPrice += globalAddons(input, settings, lines);
  unitPrice += productAddons(input.categorySlug, input.productSpecific, settings, lines);

  let subtotal = unitPrice * quantity;
  const minOrder = addon(settings, 'minOrderPrice');
  if (minOrder > 0 && subtotal < minOrder) {
    lines.push({ label: 'Minimum order adjustment', amount: roundMoney(minOrder - subtotal) });
    subtotal = minOrder;
  }

  const total = roundMoney(subtotal);
  const unitRounded = roundMoney(unitPrice);

  return {
    unitPrice: unitRounded,
    quantity,
    subtotal: total,
    total,
    currency: settings?.currency || 'GBP',
    complete: true,
    breakdown: lines.map((l) => ({ ...l, amount: roundMoney(l.amount) })),
  };
}
