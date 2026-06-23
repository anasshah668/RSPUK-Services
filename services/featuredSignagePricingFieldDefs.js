/** Category slugs with full requirement forms (used for admin + calculator). */
export const FEATURED_PRICING_CATEGORIES = [
  { slug: '_default', label: 'Default (all other categories)' },
  { slug: '3d-built-up-letters', label: '3D Built-up Letters' },
  { slug: '2d-box-signage', label: '2D Box Signage' },
  { slug: 'flex-face', label: 'Flex Face' },
  { slug: 'lightbox', label: 'Lightbox' },
  { slug: 'printed-board', label: 'Printed Board' },
  { slug: 'posters', label: 'Posters' },
  { slug: 'pvc-banners', label: 'PVC Banners' },
  { slug: 'correx-foamex-aluminium-prints', label: 'Correx / Foamex / Aluminium' },
  { slug: 'backlit-prints', label: 'Backlit Prints' },
  { slug: 'canvas-prints', label: 'Canvas Prints' },
  { slug: 'printed-vinyl', label: 'Printed Vinyl' },
  { slug: 'frosted-vinyl', label: 'Frosted Vinyl' },
  { slug: 'one-way-vision', label: 'One Way Vision' },
  { slug: 'cut-vinyl', label: 'Cut Vinyl' },
  { slug: 'privacy-films', label: 'Privacy Films' },
  { slug: 'cnc-router-cutting', label: 'CNC Router Cutting' },
  { slug: 'fibre-laser-cutting', label: 'Fibre Laser Cutting' },
  { slug: 'fibre-laser-welding', label: 'Fibre Laser Welding' },
];

const commonFields = [
  { key: 'basePrice', label: 'Base price (£)', step: '0.01' },
  { key: 'widthCmRate', label: 'Per cm width (£)', step: '0.01' },
  { key: 'heightCmRate', label: 'Per cm height (£)', step: '0.01' },
  { key: 'areaCm2Rate', label: 'Per cm² area (£) — used when > 0 instead of width+height rates', step: '0.0001' },
  { key: 'minOrderPrice', label: 'Minimum order total (£)', step: '0.01' },
  { key: 'outdoorAddon', label: 'Outdoor usage add-on (£)', step: '0.01' },
  { key: 'installationAddon', label: 'Installation required (£)', step: '0.01' },
  { key: 'deliveryAddon', label: 'Delivery required (£)', step: '0.01' },
  { key: 'rushOrderAddon', label: 'Rush order (£)', step: '0.01' },
  { key: 'designServiceAddon', label: 'Design service (£)', step: '0.01' },
];

const categoryExtraFields = {
  '3d-built-up-letters': [
    { key: 'letterUnitAddon', label: 'Per letter (£)', step: '0.01' },
    { key: 'letterHeightCmRate', label: 'Per cm letter height (£)', step: '0.01' },
    { key: 'material_metal', label: 'Material: Metal (£)', step: '0.01' },
    { key: 'material_aluminum', label: 'Material: Aluminum (£)', step: '0.01' },
    { key: 'lightingType_backlit', label: 'Lighting: Backlit (£)', step: '0.01' },
    { key: 'lightingType_halo', label: 'Lighting: Halo (£)', step: '0.01' },
    { key: 'lightingType_none', label: 'Lighting: None (£)', step: '0.01' },
    { key: 'ledColor_rgb', label: 'LED: RGB (£)', step: '0.01' },
    { key: 'ledColor_warm', label: 'LED: Warm (£)', step: '0.01' },
    { key: 'mountingType_raceway', label: 'Mounting: Raceway (£)', step: '0.01' },
    { key: 'mountingType_hanging', label: 'Mounting: Hanging (£)', step: '0.01' },
  ],
  '2d-box-signage': [
    { key: 'lighting_yes', label: 'Lighting: Yes (£)', step: '0.01' },
    { key: 'sided_double-sided', label: 'Double-sided (£)', step: '0.01' },
    { key: 'frameMaterial_ms', label: 'Frame: MS (£)', step: '0.01' },
    { key: 'faceMaterial_flex', label: 'Face: Flex (£)', step: '0.01' },
    { key: 'mountingType_pole', label: 'Mounting: Pole (£)', step: '0.01' },
    { key: 'mountingType_hanging', label: 'Mounting: Hanging (£)', step: '0.01' },
  ],
  'flex-face': [
    { key: 'flexType_backlit', label: 'Flex: Backlit (£)', step: '0.01' },
    { key: 'frameIncluded_yes', label: 'Frame included (£)', step: '0.01' },
    { key: 'printingType_eco-solvent', label: 'Printing: Eco Solvent (£)', step: '0.01' },
    { key: 'lighting_yes', label: 'Lighting: Yes (£)', step: '0.01' },
  ],
  lightbox: [
    { key: 'brightnessLevel_high', label: 'Brightness: High (£)', step: '0.01' },
    { key: 'lightboxFrameType_acrylic', label: 'Frame: Acrylic (£)', step: '0.01' },
    { key: 'faceMaterial_fabric', label: 'Face: Fabric (£)', step: '0.01' },
  ],
  'printed-board': [
    { key: 'boardType_pvc', label: 'Board: PVC (£)', step: '0.01' },
    { key: 'boardType_acrylic', label: 'Board: Acrylic (£)', step: '0.01' },
    { key: 'lamination_yes', label: 'Lamination: Yes (£)', step: '0.01' },
    { key: 'finish_gloss', label: 'Finish: Gloss (£)', step: '0.01' },
  ],
};

export function getFieldDefinitionsForCategory(categorySlug) {
  const slug = String(categorySlug || '_default').toLowerCase();
  const extras = categoryExtraFields[slug] || [];
  return [...commonFields, ...extras];
}

export function getDefaultSettingsForCategory(categorySlug) {
  const fields = getFieldDefinitionsForCategory(categorySlug);
  const settings = { categorySlug: String(categorySlug || '_default').toLowerCase(), currency: 'GBP' };
  fields.forEach(({ key }) => {
    settings[key] = 0;
  });
  return settings;
}

export const ALL_NUMERIC_SETTING_KEYS = [
  ...new Set(
    FEATURED_PRICING_CATEGORIES.flatMap((c) =>
      getFieldDefinitionsForCategory(c.slug).map((f) => f.key)
    )
  ),
];
