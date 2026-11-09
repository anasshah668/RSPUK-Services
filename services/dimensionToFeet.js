/**
 * Featured signage size conversion.
 * Admin rates are per foot. Convert through feet using:
 *   1 ft = 12 in = 30.48 cm = 304.8 mm
 * so equivalent sizes produce the same price.
 */

export const INCHES_PER_FOOT = 12;
export const CM_PER_FOOT = 30.48;
export const MM_PER_FOOT = 304.8;
export const M_PER_FOOT = 0.3048;
export const MM_PER_INCH = 25.4;

export function normalizeDimensionUnit(unit) {
  const u = String(unit || 'mm').toLowerCase().trim();
  if (u === 'ft' || u === 'feet' || u === 'foot') return 'ft';
  if (u === 'inch' || u === 'in' || u === 'inches') return 'inch';
  if (u === 'cm' || u.startsWith('centi')) return 'cm';
  if (u === 'm' || u === 'meter' || u === 'metre' || u === 'meters' || u === 'metres') return 'm';
  return 'mm';
}

function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === '') return 0;
  const num = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function parseDimensionToFt(value, unit) {
  const num = parsePositiveNumber(value);
  if (num <= 0) return 0;
  switch (normalizeDimensionUnit(unit)) {
    case 'ft':
      return num;
    case 'inch':
      return num / INCHES_PER_FOOT;
    case 'cm':
      return num / CM_PER_FOOT;
    case 'm':
      return num / M_PER_FOOT;
    default:
      return num / MM_PER_FOOT;
  }
}

export function dimensionToMm(value, unit) {
  return parseDimensionToFt(value, unit) * MM_PER_FOOT;
}

export function convertDimensionValue(value, fromUnit, toUnit) {
  const num = parsePositiveNumber(value);
  if (num <= 0) return value ?? '';
  const from = normalizeDimensionUnit(fromUnit);
  const to = normalizeDimensionUnit(toUnit);
  if (from === to) return String(value);
  const ft = parseDimensionToFt(num, from);
  let next;
  switch (to) {
    case 'ft':
      next = ft;
      break;
    case 'inch':
      next = ft * INCHES_PER_FOOT;
      break;
    case 'cm':
      next = ft * CM_PER_FOOT;
      break;
    case 'm':
      next = ft * M_PER_FOOT;
      break;
    default:
      next = ft * MM_PER_FOOT;
  }
  const rounded = Math.round(next * 1e8) / 1e8;
  return String(Number(rounded.toFixed(8)));
}
