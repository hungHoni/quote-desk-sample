// The list of saved quotes.

import { formatDate } from './dates.js';
import { byId, el, setText } from './dom.js';
import { formatCents } from './money.js';

/** @typedef {import('./store.js').QuoteRecord} QuoteRecord */

function savedItem(record, currency) {
  const { quote } = record;
  const parts = quote.lines.length === 1 ? '1 part' : `${quote.lines.length} parts`;
  const rush = quote.rush ? ' · rush' : '';
  return el('li', { class: 'saved-item', dataset: { number: quote.number } }, [
    el('span', { class: 'saved-number', text: quote.number }),
    el('p', { class: 'saved-who' }, [
      el('strong', { text: quote.customer.trim() || 'No customer' }),
      el('span', { text: `${formatDate(quote.date)} · ${parts}${rush}` }),
    ]),
    el('span', { class: 'saved-total', text: formatCents(record.totalCents, currency) }),
    el('div', { class: 'saved-actions' }, [
      el('button', {
        type: 'button',
        class: 'btn',
        text: 'Open',
        'aria-label': `Open quote ${quote.number}`,
        dataset: { action: 'open' },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn-quiet',
        text: 'Delete',
        'aria-label': `Delete quote ${quote.number}`,
        dataset: { action: 'delete' },
      }),
    ]),
  ]);
}

/**
 * @param {QuoteRecord[]} records newest first
 * @param {string} currency
 */
export function renderSaved(records, currency) {
  byId('saved-list').replaceChildren(...records.map((record) => savedItem(record, currency)));
  byId('saved-empty').hidden = records.length > 0;
  setText(byId('saved-count'), String(records.length));
}
