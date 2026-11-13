// Pure updates to a quote: every function returns a new quote and leaves the old one alone.

import { materialNames, thicknessesFor } from './price-book.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./quote-math.js').Quote} Quote */
/** @typedef {import('./quote-math.js').QuoteLine} QuoteLine */

export const QUOTE_VALID_DAYS = 14;

const QUOTE_FIELDS = Object.freeze(['customer', 'date', 'rush']);
const LINE_FIELDS = Object.freeze([
  'partName',
  'material',
  'thickness',
  'widthMm',
  'heightMm',
  'cutLengthMm',
  'pierces',
  'quantity',
]);
const STARTING_PART = Object.freeze({
  partName: '',
  widthMm: 100,
  heightMm: 100,
  cutLengthMm: 400,
  pierces: 1,
  quantity: 1,
});

/**
 * @param {PriceBook} book
 * @param {string} id
 * @returns {QuoteLine} a part on the first material and thickness in the price list
 */
export function newLine(book, id) {
  const material = materialNames(book)[0];
  return { id, ...STARTING_PART, material, thickness: thicknessesFor(book, material)[0] };
}

/**
 * @param {string} today ISO date
 * @param {PriceBook} book
 * @param {string} lineId
 * @returns {Quote} an unsaved draft with one part
 */
export function newQuote(today, book, lineId) {
  return { number: null, customer: '', date: today, rush: false, lines: [newLine(book, lineId)] };
}

/**
 * @param {Quote} quote
 * @param {PriceBook} book
 * @param {string} id
 * @returns {Quote}
 */
export function addLine(quote, book, id) {
  return { ...quote, lines: [...quote.lines, newLine(book, id)] };
}

/** A new material keeps the thickness if it stocks it, otherwise takes its first one. */
function withLineField(line, book, field, value) {
  const changed = { ...line, [field]: value };
  if (field !== 'material') return changed;

  const stocked = thicknessesFor(book, value);
  const keepsThickness = stocked.length === 0 || stocked.includes(changed.thickness);
  return keepsThickness ? changed : { ...changed, thickness: stocked[0] };
}

/**
 * @param {Quote} quote
 * @param {PriceBook} book
 * @param {string} lineId
 * @param {string} field
 * @param {unknown} value
 * @returns {Quote} the same quote when the part or the field does not exist
 */
export function updateLine(quote, book, lineId, field, value) {
  const exists = quote.lines.some((line) => line.id === lineId);
  if (!exists || !LINE_FIELDS.includes(field)) return quote;

  const lines = quote.lines.map((line) => (line.id === lineId ? withLineField(line, book, field, value) : line));
  return { ...quote, lines };
}

/**
 * @param {Quote} quote
 * @param {string} lineId
 * @returns {Quote}
 */
export function removeLine(quote, lineId) {
  if (!quote.lines.some((line) => line.id === lineId)) return quote;
  return { ...quote, lines: quote.lines.filter((line) => line.id !== lineId) };
}

/**
 * @param {Quote} quote
 * @param {string} lineId
 * @param {string} copyId
 * @returns {Quote} with a copy of the part placed right after it
 */
export function duplicateLine(quote, lineId, copyId) {
  if (!quote.lines.some((line) => line.id === lineId)) return quote;
  const lines = quote.lines.flatMap((line) => (line.id === lineId ? [line, { ...line, id: copyId }] : [line]));
  return { ...quote, lines };
}

/**
 * @param {Quote} quote
 * @param {string} field "customer", "date" or "rush"
 * @param {unknown} value
 * @returns {Quote}
 */
export function setQuoteField(quote, field, value) {
  if (!QUOTE_FIELDS.includes(field)) return quote;
  return { ...quote, [field]: value };
}
