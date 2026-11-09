import {
  parseDimensionToFt,
  convertDimensionValue,
  MM_PER_FOOT,
  MM_PER_INCH,
} from '../services/dimensionToFeet.js';
import { computeFeaturedSignagePrice } from '../services/featuredSignagePricingCalculator.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function almostEqual(a, b, eps = 1e-10) {
  return Math.abs(a - b) <= eps;
}

const ft = parseDimensionToFt(1, 'ft');
const inch = parseDimensionToFt(12, 'inch');
const cm = parseDimensionToFt(30.48, 'cm');
const mm = parseDimensionToFt(304.8, 'mm');
const aliasIn = parseDimensionToFt(12, 'in');

assert(ft === 1, `1 ft should be 1, got ${ft}`);
assert(almostEqual(inch, 1), `12 in should be 1 ft, got ${inch}`);
assert(almostEqual(cm, 1), `30.48 cm should be 1 ft, got ${cm}`);
assert(almostEqual(mm, 1), `304.8 mm should be 1 ft, got ${mm}`);
assert(almostEqual(aliasIn, 1), `alias in should match inch, got ${aliasIn}`);
assert(MM_PER_FOOT === 304.8, '1 ft must be 304.8 mm');
assert(MM_PER_INCH === 25.4, '1 in must be 25.4 mm');

assert(convertDimensionValue(1, 'ft', 'cm') === '30.48', `1 ft → cm got ${convertDimensionValue(1, 'ft', 'cm')}`);
assert(convertDimensionValue(1, 'ft', 'mm') === '304.8', `1 ft → mm got ${convertDimensionValue(1, 'ft', 'mm')}`);
assert(convertDimensionValue(1, 'ft', 'inch') === '12', `1 ft → inch got ${convertDimensionValue(1, 'ft', 'inch')}`);
assert(convertDimensionValue(30.48, 'cm', 'ft') === '1', `30.48 cm → ft got ${convertDimensionValue(30.48, 'cm', 'ft')}`);
assert(convertDimensionValue(12, 'inch', 'cm') === '30.48', `12 in → cm got ${convertDimensionValue(12, 'inch', 'cm')}`);

const widthOnly = {
  basePrice: 0,
  widthCmRate: 10,
  heightCmRate: 0,
  areaCm2Rate: 0,
  minOrderPrice: 0,
  currency: 'GBP',
};

const areaOnly = {
  basePrice: 0,
  widthCmRate: 0,
  heightCmRate: 0,
  areaCm2Rate: 10,
  minOrderPrice: 0,
  currency: 'GBP',
};

const equivalents = [
  { width: 1, height: 1, unit: 'ft' },
  { width: 12, height: 12, unit: 'inch' },
  { width: 12, height: 12, unit: 'in' },
  { width: 30.48, height: 30.48, unit: 'cm' },
  { width: 304.8, height: 304.8, unit: 'mm' },
];

for (const input of equivalents) {
  const widthPrice = computeFeaturedSignagePrice({ ...input, quantity: 1 }, widthOnly);
  const areaPrice = computeFeaturedSignagePrice({ ...input, quantity: 1 }, areaOnly);
  assert(widthPrice.total === 10, `${input.unit} width rate expected 10, got ${widthPrice.total}`);
  assert(areaPrice.total === 10, `${input.unit} area rate expected 10, got ${areaPrice.total}`);
}

const halfCm = computeFeaturedSignagePrice(
  { width: 15.24, height: 15.24, unit: 'cm', quantity: 1 },
  widthOnly
);
assert(halfCm.total === 5, `half-size cm expected 5, got ${halfCm.total}`);

const twoByThreeFt = computeFeaturedSignagePrice(
  { width: 2, height: 3, unit: 'ft', quantity: 1 },
  areaOnly
);
const twoByThreeCm = computeFeaturedSignagePrice(
  { width: 60.96, height: 91.44, unit: 'cm', quantity: 1 },
  areaOnly
);
assert(twoByThreeFt.total === 60, `2x3 ft area expected 60, got ${twoByThreeFt.total}`);
assert(twoByThreeCm.total === 60, `equivalent cm area expected 60, got ${twoByThreeCm.total}`);

const letterFt = computeFeaturedSignagePrice(
  {
    categorySlug: '3d-built-up-letters',
    width: 1,
    height: 1,
    unit: 'ft',
    quantity: 1,
    productSpecific: { letterHeight: 1 },
  },
  { ...widthOnly, letterHeightCmRate: 4 }
);
const letterMm = computeFeaturedSignagePrice(
  {
    categorySlug: '3d-built-up-letters',
    width: 304.8,
    height: 304.8,
    unit: 'mm',
    quantity: 1,
    productSpecific: { letterHeight: 304.8 },
  },
  { ...widthOnly, letterHeightCmRate: 4 }
);
assert(letterFt.total === letterMm.total, `letter height mismatch ${letterFt.total} vs ${letterMm.total}`);
assert(letterFt.total === 14, `letter height 1ft @ £4 + width £10 expected 14, got ${letterFt.total}`);

const withExtras = computeFeaturedSignagePrice(
  {
    width: 1,
    height: 1,
    unit: 'ft',
    quantity: 1,
    usage: 'outdoor',
    installationRequired: 'yes',
    productSpecific: { lighting: 'yes' },
    categorySlug: '2d-box-signage',
  },
  { ...widthOnly, outdoorAddon: 5, installationAddon: 20, lighting_yes: 8, minOrderPrice: 50 }
);
const sizeOnly = computeFeaturedSignagePrice(
  {
    width: 1,
    height: 1,
    unit: 'ft',
    quantity: 1,
    usage: 'outdoor',
    installationRequired: 'yes',
    productSpecific: { lighting: 'yes' },
    categorySlug: '2d-box-signage',
    sizeOnly: true,
  },
  { ...widthOnly, outdoorAddon: 5, installationAddon: 20, lighting_yes: 8, minOrderPrice: 50 }
);
assert(sizeOnly.total === 10, `size-only estimate expected 10, got ${sizeOnly.total}`);
assert(withExtras.total === 50, `full quote should include extras/min order, got ${withExtras.total}`);

console.log('Featured unit conversion checks passed.');
