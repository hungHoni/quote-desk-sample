// The pricing rules, taken one for one from the shop's quote spreadsheet.
// Every result is in whole cents so money never picks up floating-point dust.

import { findMaterialRow, materialNames } from './price-book.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./price-book.js').DiscountTier} DiscountTier */
/** @typedef {{ id: string, partName: string, material: string, thickness: number, widthMm: number, heightMm: number, cutLengthMm: number, pierces: number, quantity: number }} QuoteLine */
/** @typedef {{ number: string | null, customer: string, date: string, rush: boolean, lines: QuoteLine[] }} Quote */
/** @typedef {{ areaM2: number, materialCost: number, cutMinutes: number, cutCost: number, unitCents: number, discountPercent: number, lineCents: number }} LinePrice */
/** @typedef {Record<string, string>} FieldErrors field name to a plain-words message */
/**
 * @typedef {{ ok: true, lines: (LinePrice & { id: string })[], partsCents: number, setupCents: number, rushCents: number,
 *   beforeMinimumCents: number, minimumApplied: boolean, totalCents: number }} PricedQuote
 */
/** @typedef {PricedQuote | { ok: false, lineErrors: Record<string, FieldErrors> }} QuoteResult */

const MM2_PER_M2 = 1_000_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const CENTS_PER_UNIT = 100;
const PERCENT = 100;
/** Spreadsheets round on 15 significant digits; matching that keeps 1.005 rounding to 1.01. */
const SPREADSHEET_DIGITS = 15;

export const MAX_PART_NAME = 60;

export const LINE_NUMBER_FIELDS = Object.freeze([
  Object.freeze({ key: 'widthMm', label: 'Width', min: 1, max: 3000, whole: false }),
  Object.freeze({ key: 'heightMm', label: 'Height', min: 1, max: 3000, whole: false }),
  Object.freeze({ key: 'cutLengthMm', label: 'Cut length', min: 1, max: 2_000_000, whole: false }),
  Object.freeze({ key: 'pierces', label: 'Pierces', min: 0, max: 100_000, whole: true }),
  Object.freeze({ key: 'quantity', label: 'Quantity', min: 1, max: 100_000, whole: true }),
]);

/**
 * Round an amount to whole cents, half up, the way a spreadsheet's ROUND(x, 2) does.
 * @param {number} amount
 * @returns {number}
 */
export function toCents(amount) {
  return Math.round(Number((amount * CENTS_PER_UNIT).toPrecision(SPREADSHEET_DIGITS)));
}

/**
 * @param {readonly DiscountTier[]} tiers sorted from the smallest quantity up
 * @param {number} quantity
 * @returns {number} the percent off for the highest tier the quantity reaches
 */
export function discountPercentFor(tiers, quantity) {
  return tiers.reduce((percent, tier) => (quantity >= tier.minQty ? tier.percent : percent), 0);
}

const plain = (value) => value.toLocaleString('en-US');

/** @returns {FieldErrors} */
function numberErrors(line) {
  const problems = LINE_NUMBER_FIELDS.filter((field) => {
    const value = line[field.key];
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    const fits = isNumber && value >= field.min && value <= field.max;
    return !fits || (field.whole && !Number.isInteger(value));
  });
  return Object.fromEntries(
    problems.map((field) => {
      const kind = field.whole ? 'a whole number' : 'a number';
      return [field.key, `${field.label} must be ${kind} from ${plain(field.min)} to ${plain(field.max)}`];
    }),
  );
}

/** @returns {FieldErrors} */
function materialErrors(line, book) {
  if (!materialNames(book).includes(line.material)) return { material: 'Pick a material from the price list' };
  if (!findMaterialRow(book, line.material, line.thickness)) {
    return { thickness: `Pick a thickness the shop stocks for ${line.material}` };
  }
  return {};
}

/** @returns {FieldErrors} */
function nameErrors(line) {
  const tooLong = typeof line.partName === 'string' && line.partName.length > MAX_PART_NAME;
  return tooLong ? { partName: `Part name must be ${MAX_PART_NAME} characters or fewer` } : {};
}

/**
 * @param {QuoteLine} line
 * @param {PriceBook} book
 * @returns {FieldErrors} empty when the part can be priced
 */
export function validateLine(line, book) {
  return { ...nameErrors(line), ...materialErrors(line, book), ...numberErrors(line) };
}

/**
 * Price one part. The part must already pass validateLine.
 * @param {QuoteLine} line
 * @param {PriceBook} book
 * @returns {LinePrice}
 */
export function priceLine(line, book) {
  const material = findMaterialRow(book, line.material, line.thickness);
  if (!material) throw new Error(`No price for ${line.material} ${line.thickness} mm`);

  const { settings } = book;
  const areaM2 = (line.widthMm * line.heightMm) / MM2_PER_M2;
  const scrap = 1 + settings.scrapPercent / PERCENT;
  const markup = 1 + settings.markupPercent / PERCENT;
  const materialCost = areaM2 * material.pricePerM2 * scrap * markup;

  const pierceMinutes = (line.pierces * material.pierceSec) / SECONDS_PER_MINUTE;
  const cutMinutes = line.cutLengthMm / material.cutSpeed + pierceMinutes;
  const cutCost = (cutMinutes * settings.machineRatePerHour) / MINUTES_PER_HOUR;

  const unitCents = toCents(materialCost + cutCost);
  const discountPercent = discountPercentFor(book.discountTiers, line.quantity);
  const lineCents = toCents((unitCents / CENTS_PER_UNIT) * line.quantity * (1 - discountPercent / PERCENT));

  return { areaM2, materialCost, cutMinutes, cutCost, unitCents, discountPercent, lineCents };
}

/** @returns {Record<string, FieldErrors>} only the parts that have problems, by part id */
function collectLineErrors(lines, book) {
  const checked = lines.map((line) => [line.id, validateLine(line, book)]);
  return Object.fromEntries(checked.filter(([, errors]) => Object.keys(errors).length > 0));
}

const EMPTY_QUOTE = Object.freeze({
  ok: true,
  lines: Object.freeze([]),
  partsCents: 0,
  setupCents: 0,
  rushCents: 0,
  beforeMinimumCents: 0,
  minimumApplied: false,
  totalCents: 0,
});

/**
 * Price a whole quote: parts, one setup fee, the rush surcharge, then the minimum charge.
 * @param {Quote} quote
 * @param {PriceBook} book
 * @returns {QuoteResult}
 */
export function priceQuote(quote, book) {
  const lineErrors = collectLineErrors(quote.lines, book);
  if (Object.keys(lineErrors).length > 0) return { ok: false, lineErrors };
  if (quote.lines.length === 0) return EMPTY_QUOTE;

  const { settings } = book;
  const lines = quote.lines.map((line) => ({ id: line.id, ...priceLine(line, book) }));
  const partsCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const setupCents = toCents(settings.setupFee);
  const rushBase = (partsCents + setupCents) / CENTS_PER_UNIT;
  const rushCents = quote.rush ? toCents(rushBase * (settings.rushPercent / PERCENT)) : 0;

  const beforeMinimumCents = partsCents + setupCents + rushCents;
  const minimumCents = toCents(settings.minimumCharge);
  const minimumApplied = beforeMinimumCents < minimumCents;
  const totalCents = Math.max(minimumCents, beforeMinimumCents);

  return { ok: true, lines, partsCents, setupCents, rushCents, beforeMinimumCents, minimumApplied, totalCents };
}
