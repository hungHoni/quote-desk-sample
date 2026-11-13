// The price book: every price and rule the shop quotes with, in one place.
// The old spreadsheet had these spread over a hidden tab and typed inside formulas.

/** @typedef {{ material: string, thickness: number, pricePerM2: number, cutSpeed: number, pierceSec: number }} MaterialRow */
/** @typedef {{ machineRatePerHour: number, setupFee: number, scrapPercent: number, markupPercent: number, minimumCharge: number, rushPercent: number }} ShopSettings */
/** @typedef {{ minQty: number, percent: number }} DiscountTier */
/** @typedef {{ shopName: string, currency: string, settings: ShopSettings, discountTiers: DiscountTier[], materials: MaterialRow[] }} PriceBook */
/** @typedef {{ key: string, label: string, unit: string, min: number, max: number }} NumberField */
/** @typedef {{ ok: true, book: PriceBook } | { ok: false, error: string }} BookChange */

const MAX_SHOP_NAME = 80;
const MAX_CURRENCY = 3;
const MAX_MATERIAL_NAME = 40;
const MAX_THICKNESS_MM = 1000;
const MAX_PERCENT = 100;

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** @type {readonly NumberField[]} */
export const SETTING_FIELDS = deepFreeze([
  { key: 'machineRatePerHour', label: 'Machine rate', unit: '$ per hour', min: 0.01, max: 10_000 },
  { key: 'setupFee', label: 'Setup fee', unit: '$ per quote', min: 0, max: 100_000 },
  { key: 'scrapPercent', label: 'Scrap allowance', unit: '%', min: 0, max: 100 },
  { key: 'markupPercent', label: 'Material markup', unit: '%', min: 0, max: 500 },
  { key: 'minimumCharge', label: 'Minimum charge', unit: '$', min: 0, max: 100_000 },
  { key: 'rushPercent', label: 'Rush surcharge', unit: '%', min: 0, max: 200 },
]);

/** @type {readonly NumberField[]} */
export const MATERIAL_FIELDS = deepFreeze([
  { key: 'pricePerM2', label: 'Sheet price', unit: '$ per m²', min: 0, max: 100_000 },
  { key: 'cutSpeed', label: 'Cut speed', unit: 'mm per min', min: 1, max: 1_000_000 },
  { key: 'pierceSec', label: 'Pierce time', unit: 'seconds', min: 0, max: 600 },
]);

const row = (material, thickness, pricePerM2, cutSpeed, pierceSec) => ({
  material,
  thickness,
  pricePerM2,
  cutSpeed,
  pierceSec,
});

/** Sample prices for a fictional shop. @type {PriceBook} */
export const DEFAULT_PRICE_BOOK = deepFreeze({
  shopName: 'Northgate Laser (sample shop)',
  currency: '$',
  settings: {
    machineRatePerHour: 90,
    setupFee: 25,
    scrapPercent: 15,
    markupPercent: 30,
    minimumCharge: 45,
    rushPercent: 25,
  },
  discountTiers: [
    { minQty: 1, percent: 0 },
    { minQty: 10, percent: 5 },
    { minQty: 50, percent: 10 },
    { minQty: 200, percent: 15 },
  ],
  materials: [
    row('Mild steel', 1.5, 14, 6500, 0.3),
    row('Mild steel', 3, 26, 3800, 0.6),
    row('Mild steel', 6, 52, 1900, 1.2),
    row('Mild steel', 10, 88, 1100, 2.5),
    row('Stainless steel', 1.5, 38, 5200, 0.4),
    row('Stainless steel', 3, 74, 2600, 0.8),
    row('Stainless steel', 6, 150, 1100, 1.8),
    row('Aluminium', 2, 24, 5600, 0.4),
    row('Aluminium', 3, 36, 3600, 0.6),
    row('Aluminium', 6, 72, 1500, 1.5),
    row('Acrylic', 3, 22, 1500, 0.2),
    row('Acrylic', 5, 34, 900, 0.3),
    row('Acrylic', 10, 68, 400, 0.5),
    row('Plywood', 3, 9, 2400, 0.2),
    row('Plywood', 6, 15, 1300, 0.3),
    row('Plywood', 12, 27, 600, 0.5),
  ],
});

/**
 * @param {PriceBook} book
 * @returns {string[]} each material once, in price-list order
 */
export function materialNames(book) {
  return [...new Set(book.materials.map((item) => item.material))];
}

/**
 * @param {PriceBook} book
 * @param {string} material
 * @returns {number[]}
 */
export function thicknessesFor(book, material) {
  return book.materials.filter((item) => item.material === material).map((item) => item.thickness);
}

/**
 * @param {PriceBook} book
 * @param {string} material
 * @param {number} thickness
 * @returns {MaterialRow | undefined}
 */
export function findMaterialRow(book, material, thickness) {
  return book.materials.find((item) => item.material === material && item.thickness === thickness);
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isShortText = (value, max) => typeof value === 'string' && value.trim() !== '' && value.length <= max;
const plain = (value) => value.toLocaleString('en-US');

/**
 * @param {unknown} value
 * @param {NumberField} field
 * @returns {string | null} what is wrong, in plain words, or null
 */
function numberError(value, field) {
  const inRange = isFiniteNumber(value) && value >= field.min && value <= field.max;
  return inRange ? null : `${field.label} must be a number from ${plain(field.min)} to ${plain(field.max)}`;
}

/**
 * @param {PriceBook} book
 * @param {string} key
 * @param {unknown} value
 * @returns {BookChange}
 */
export function withSetting(book, key, value) {
  const field = SETTING_FIELDS.find((item) => item.key === key);
  if (!field) return { ok: false, error: `Unknown setting: ${key}` };

  const error = numberError(value, field);
  if (error) return { ok: false, error };

  return { ok: true, book: deepFreeze({ ...book, settings: { ...book.settings, [key]: value } }) };
}

/**
 * @param {PriceBook} book
 * @param {number} index row in the material list
 * @param {string} key
 * @param {unknown} value
 * @returns {BookChange}
 */
export function withMaterialValue(book, index, key, value) {
  const field = MATERIAL_FIELDS.find((item) => item.key === key);
  if (!field) return { ok: false, error: `Unknown price column: ${key}` };
  if (!book.materials[index]) return { ok: false, error: 'That material row does not exist' };

  const error = numberError(value, field);
  if (error) return { ok: false, error };

  const materials = book.materials.map((item, at) => (at === index ? { ...item, [key]: value } : item));
  return { ok: true, book: deepFreeze({ ...book, materials }) };
}

/** @returns {string[]} */
function settingErrors(settings) {
  if (!isPlainObject(settings)) return ['Shop settings are missing'];
  return SETTING_FIELDS.map((field) => numberError(settings[field.key], field)).filter(Boolean);
}

/** @returns {string[]} */
function tierErrors(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return ['Quantity discounts are missing'];

  const isTier = (tier) =>
    isPlainObject(tier) &&
    Number.isInteger(tier.minQty) &&
    tier.minQty >= 1 &&
    isFiniteNumber(tier.percent) &&
    tier.percent >= 0 &&
    tier.percent <= MAX_PERCENT;
  if (!tiers.every(isTier)) return ['A quantity discount has a bad value'];
  if (tiers[0].minQty !== 1) return ['Quantity discounts must start at a quantity of 1'];

  const climbs = tiers.every((tier, at) => at === 0 || tier.minQty > tiers[at - 1].minQty);
  return climbs ? [] : ['Quantity discounts must go from the smallest quantity to the largest'];
}

/** @returns {string[]} */
function materialRowErrors(item, at) {
  const where = `Material row ${at + 1}`;
  if (!isPlainObject(item)) return [`${where} is not a row`];
  if (!isShortText(item.material, MAX_MATERIAL_NAME)) return [`${where} has no material name`];

  const thicknessOk = isFiniteNumber(item.thickness) && item.thickness > 0 && item.thickness <= MAX_THICKNESS_MM;
  const thickness = thicknessOk ? [] : [`${where}: thickness must be a number above 0`];
  const numbers = MATERIAL_FIELDS.map((field) => numberError(item[field.key], field))
    .filter(Boolean)
    .map((error) => `${where}: ${error}`);
  return [...thickness, ...numbers];
}

/** @returns {string[]} */
function materialErrors(materials) {
  if (!Array.isArray(materials) || materials.length === 0) return ['The material list is empty'];

  const rowErrors = materials.flatMap(materialRowErrors);
  if (rowErrors.length > 0) return rowErrors;

  const keys = materials.map((item) => `${item.material}|${item.thickness}`);
  return new Set(keys).size === keys.length ? [] : ['A material and thickness is listed twice'];
}

/** Copy only the fields a price book has, so stray data from storage is dropped. */
function tidyBook(candidate) {
  const pick = (source, fields) => Object.fromEntries(fields.map((field) => [field.key, source[field.key]]));
  return deepFreeze({
    shopName: candidate.shopName,
    currency: candidate.currency,
    settings: pick(candidate.settings, SETTING_FIELDS),
    discountTiers: candidate.discountTiers.map(({ minQty, percent }) => ({ minQty, percent })),
    materials: candidate.materials.map((item) => ({
      material: item.material,
      thickness: item.thickness,
      ...pick(item, MATERIAL_FIELDS),
    })),
  });
}

/**
 * Check a price book that came from outside the code, such as browser storage.
 * @param {unknown} candidate
 * @returns {{ ok: true, book: PriceBook } | { ok: false, errors: string[] }}
 */
export function validatePriceBook(candidate) {
  if (!isPlainObject(candidate)) return { ok: false, errors: ['The price book is not readable'] };

  const errors = [
    ...(isShortText(candidate.shopName, MAX_SHOP_NAME) ? [] : ['The shop name is missing']),
    ...(isShortText(candidate.currency, MAX_CURRENCY) ? [] : ['The currency symbol is missing']),
    ...settingErrors(candidate.settings),
    ...tierErrors(candidate.discountTiers),
    ...materialErrors(candidate.materials),
  ];
  return errors.length > 0 ? { ok: false, errors } : { ok: true, book: tidyBook(candidate) };
}
