// Turns a priced quote into plain text the owner can paste into an email.

import { addDays, formatDate } from './dates.js';
import { formatCents } from './money.js';
import { QUOTE_VALID_DAYS } from './quote-state.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./quote-math.js').Quote} Quote */
/** @typedef {import('./quote-math.js').QuoteLine} QuoteLine */
/** @typedef {import('./quote-math.js').QuoteResult} QuoteResult */

/**
 * @param {QuoteLine} line
 * @param {number} index position in the quote, from 0
 * @returns {string} the part's name, or "Part 3" when it has none
 */
export function partLabel(line, index) {
  const name = typeof line.partName === 'string' ? line.partName.trim() : '';
  return name || `Part ${index + 1}`;
}

/**
 * @param {QuoteLine} line
 * @returns {string} for example "Mild steel 3 mm · 200 × 150 mm"
 */
export function partSpec(line) {
  return `${line.material} ${line.thickness} mm · ${line.widthMm} × ${line.heightMm} mm`;
}

/**
 * @param {Quote} quote
 * @returns {string} for example "valid until 26 Nov 2026"
 */
export function validUntil(quote) {
  return `valid until ${formatDate(addDays(quote.date, QUOTE_VALID_DAYS))}`;
}

/**
 * @param {Quote} quote
 * @param {QuoteResult} priced the result of priceQuote for the same quote
 * @param {PriceBook} book
 * @returns {string} the quote as plain text, or "" when it cannot be priced yet
 */
export function quoteAsText(quote, priced, book) {
  if (!priced.ok) return '';
  const money = (cents) => formatCents(cents, book.currency);
  const customer = quote.customer.trim();

  const header = [
    book.shopName,
    `Quote ${quote.number ?? '(draft)'} · ${formatDate(quote.date)} · ${validUntil(quote)}`,
    ...(customer ? [`For: ${customer}`] : []),
  ];
  const parts = quote.lines.flatMap((line, index) => {
    const price = priced.lines[index];
    const discount = price.discountPercent > 0 ? ` less ${price.discountPercent}% quantity discount` : '';
    return [
      `${index + 1}. ${partLabel(line, index)} · ${partSpec(line)}`,
      `   ${line.quantity} × ${money(price.unitCents)}${discount} = ${money(price.lineCents)}`,
    ];
  });
  const totals = [
    `Parts: ${money(priced.partsCents)}`,
    `Setup fee: ${money(priced.setupCents)}`,
    ...(quote.rush ? [`Rush job (+${book.settings.rushPercent}%): ${money(priced.rushCents)}`] : []),
    ...(priced.minimumApplied ? [`Minimum charge applies: total raised to ${money(priced.totalCents)}`] : []),
    `TOTAL: ${money(priced.totalCents)}`,
  ];
  return [...header, '', ...parts, '', ...totals].join('\n');
}
