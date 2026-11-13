// The quote ticket: the running total beside the parts, and the quote's heading.

import { isIsoDate } from './dates.js';
import { byId, el, setText } from './dom.js';
import { formatCents } from './money.js';
import { partLabel, validUntil } from './quote-text.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./quote-math.js').Quote} Quote */
/** @typedef {import('./quote-math.js').QuoteResult} QuoteResult */

const ACTION_IDS = Object.freeze(['save-quote', 'print-quote', 'copy-quote']);
const DASH = '—';
const MID_TOTAL_CHARS = 11;
const SMALL_TOTAL_CHARS = 13;

/**
 * @param {Quote} quote
 * @param {QuoteResult} priced
 * @returns {string} what stops the quote from being saved or printed, or "" when it is ready
 */
export function quoteBlocker(quote, priced) {
  if (!priced.ok) return 'Fix the marked fields to see the total.';
  if (quote.lines.length === 0) return 'Add a part to start the quote.';
  if (!isIsoDate(quote.date)) return 'Pick a date for the quote.';
  return '';
}

function totalSize(text) {
  if (text.length >= SMALL_TOTAL_CHARS) return 'small';
  return text.length >= MID_TOTAL_CHARS ? 'mid' : 'full';
}

/** Change the big total and replay its small "tick" so the change is noticed. */
function syncTotal(text) {
  const node = byId('ticket-total');
  if (node.textContent === text) return;
  node.textContent = text;
  node.dataset.size = totalSize(text);
  node.classList.remove('is-fresh');
  node.getBoundingClientRect(); // lets the browser see the class go, so the animation restarts
  node.classList.add('is-fresh');
}

function ticketLine(line, index, priced, money) {
  const amount = priced.ok ? money(priced.lines[index].lineCents) : DASH;
  return el('li', {}, [
    el('span', { class: 'ticket-line-name', text: `${partLabel(line, index)} × ${line.quantity}` }),
    el('span', { text: amount }),
  ]);
}

function syncMinimumNote(priced, money) {
  const note = byId('ticket-minimum');
  const applies = priced.ok && priced.minimumApplied;
  note.hidden = !applies;
  if (!applies) return;
  const before = money(priced.beforeMinimumCents);
  setText(note, `Minimum charge applies. This job comes to ${before}, so the total is raised to ${money(priced.totalCents)}.`);
}

/**
 * @param {Quote} quote
 * @param {QuoteResult} priced
 * @param {PriceBook} book
 */
export function syncTicket(quote, priced, book) {
  const money = (cents) => formatCents(cents, book.currency);
  const amount = (cents) => (priced.ok ? money(cents) : DASH);
  const blocker = quoteBlocker(quote, priced);
  const customer = quote.customer.trim();

  setText(byId('ticket-number'), quote.number ?? 'Draft');
  setText(byId('ticket-customer'), customer || 'No customer yet');
  byId('ticket-customer').classList.toggle('is-empty', customer === '');

  const lines = byId('ticket-lines');
  lines.hidden = quote.lines.length === 0;
  lines.replaceChildren(...quote.lines.map((line, index) => ticketLine(line, index, priced, money)));

  byId('rush').checked = quote.rush;
  setText(byId('rush-label'), `Rush job +${book.settings.rushPercent}%`);
  setText(byId('ticket-parts'), amount(priced.partsCents));
  setText(byId('ticket-setup'), amount(priced.setupCents));
  setText(byId('ticket-rush'), amount(priced.rushCents));
  syncMinimumNote(priced, money);
  syncTotal(amount(priced.totalCents));
  setText(byId('bar-total'), amount(priced.totalCents));

  setText(byId('ticket-hint'), blocker || `Prices ${validUntil(quote)}.`);
  ACTION_IDS.forEach((id) => {
    byId(id).disabled = blocker !== '';
  });
}

function statusText(quote, dirty) {
  if (!quote.number) return 'Draft · not saved yet';
  return dirty ? 'Saved · with changes not saved yet' : 'Saved';
}

/**
 * @param {Quote} quote
 * @param {boolean} dirty true when the quote has changes that are not saved
 */
export function syncQuoteHead(quote, dirty) {
  setText(byId('quote-heading'), quote.number ? `Quote ${quote.number}` : 'New quote');
  setText(byId('quote-status'), statusText(quote, dirty));
  setText(byId('save-quote'), quote.number ? 'Save changes' : 'Save quote');
}
