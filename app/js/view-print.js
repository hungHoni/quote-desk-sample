// The sheet that is printed or saved as a PDF: what the customer sees.

import { formatDate } from './dates.js';
import { byId, el } from './dom.js';
import { formatCents } from './money.js';
import { partLabel, partSpec, validUntil } from './quote-text.js';
import { quoteBlocker } from './view-ticket.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./quote-math.js').Quote} Quote */
/** @typedef {import('./quote-math.js').QuoteResult} QuoteResult */

const COLUMNS = Object.freeze([
  { text: '#', numeric: false },
  { text: 'Part', numeric: false },
  { text: 'Qty', numeric: true },
  { text: 'Each', numeric: true },
  { text: 'Amount', numeric: true },
]);

function printHead(quote, book) {
  return el('header', { class: 'print-head' }, [
    el('p', { class: 'print-shop', text: book.shopName }),
    el('p', { class: 'print-meta' }, [
      el('strong', { text: `Quote ${quote.number ?? '(draft)'}` }),
      formatDate(quote.date),
    ]),
  ]);
}

function printRow(line, index, price, money) {
  const discount = price.discountPercent > 0 ? ` · ${price.discountPercent}% quantity discount` : '';
  return el('tr', {}, [
    el('td', { text: String(index + 1) }),
    el('td', {}, [partLabel(line, index), el('small', { text: `${partSpec(line)}${discount}` })]),
    el('td', { class: 'num', text: String(line.quantity) }),
    el('td', { class: 'num', text: money(price.unitCents) }),
    el('td', { class: 'num', text: money(price.lineCents) }),
  ]);
}

function printTable(quote, priced, money) {
  const heads = COLUMNS.map((column) =>
    el('th', { scope: 'col', class: column.numeric ? 'num' : '', text: column.text }),
  );
  const rows = quote.lines.map((line, index) => printRow(line, index, priced.lines[index], money));
  return el('table', { class: 'print-table' }, [el('thead', {}, [el('tr', {}, heads)]), el('tbody', {}, rows)]);
}

function printSums(quote, priced, book, money) {
  const row = (label, cents, css = '') => el('div', { class: css }, [el('span', { text: label }), el('span', { text: money(cents) })]);
  return el('div', { class: 'print-sums' }, [
    row('Parts', priced.partsCents),
    row('Setup fee', priced.setupCents),
    ...(quote.rush ? [row(`Rush job +${book.settings.rushPercent}%`, priced.rushCents)] : []),
    ...(priced.minimumApplied ? [row('Raised to the minimum charge', priced.totalCents)] : []),
    row('Total', priced.totalCents, 'is-grand'),
  ]);
}

/**
 * Rebuild the printable quote. While the quote is not ready it only says why.
 * @param {Quote} quote
 * @param {QuoteResult} priced
 * @param {PriceBook} book
 */
export function syncPrintSheet(quote, priced, book) {
  const sheet = byId('print-sheet');
  const blocker = quoteBlocker(quote, priced);
  if (!priced.ok || blocker !== '') {
    // Printing from the browser menu still works, so say why the page is empty.
    sheet.replaceChildren(el('p', { class: 'print-for', text: `This quote is not ready to print. ${blocker}` }));
    return;
  }
  const money = (cents) => formatCents(cents, book.currency);
  const customer = quote.customer.trim();
  sheet.replaceChildren(
    printHead(quote, book),
    el('p', { class: 'print-for', text: customer ? `For: ${customer}` : '' }),
    printTable(quote, priced, money),
    printSums(quote, priced, book, money),
    el('p', { class: 'print-foot', text: `Prices ${validUntil(quote)}. Sample quote from a made-up shop.` }),
  );
}
