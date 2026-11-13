// The Prices view: every number the quotes use, editable in one place.

import { byId, el } from './dom.js';
import { MATERIAL_FIELDS, SETTING_FIELDS } from './price-book.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */

function settingRow(field, value) {
  const id = `setting-${field.key}`;
  return el('div', { class: 'setting' }, [
    el('label', { htmlFor: id }, [field.label, el('small', { text: field.unit })]),
    el('input', { type: 'number', id, step: 'any', inputMode: 'decimal', value: String(value), dataset: { setting: field.key } }),
    el('p', { class: 'field-error', role: 'status', hidden: true }),
  ]);
}

function tierRow(tier, next) {
  const range = next ? `${tier.minQty} to ${next.minQty - 1} parts` : `${tier.minQty} parts or more`;
  const discount = tier.percent === 0 ? 'no discount' : `${tier.percent}% off`;
  return el('li', {}, [el('span', { text: range }), el('span', { text: discount })]);
}

function materialRow(item, index, previous) {
  const isGroupStart = !previous || previous.material !== item.material;
  const inputs = MATERIAL_FIELDS.map((field) =>
    el('td', {}, [
      el('input', {
        type: 'number',
        step: 'any',
        inputMode: 'decimal',
        value: String(item[field.key]),
        'aria-label': `${field.label} for ${item.material} ${item.thickness} mm`,
        dataset: { row: String(index), key: field.key },
      }),
    ]),
  );
  return el('tr', { class: isGroupStart ? 'is-group-start' : '' }, [
    el('td', { class: 'material-name', text: isGroupStart ? item.material : '' }),
    el('td', { text: `${item.thickness} mm` }),
    ...inputs,
  ]);
}

function materialsHead() {
  const fieldHeads = MATERIAL_FIELDS.map((field) =>
    el('th', { scope: 'col' }, [field.label, el('small', { text: field.unit })]),
  );
  return el('thead', {}, [
    el('tr', {}, [el('th', { scope: 'col', text: 'Material' }), el('th', { scope: 'col', text: 'Thickness' }), ...fieldHeads]),
  ]);
}

/**
 * Build the whole Prices view from the price book.
 * @param {PriceBook} book
 */
export function renderPrices(book) {
  byId('shop-settings').replaceChildren(
    ...SETTING_FIELDS.map((field) => settingRow(field, book.settings[field.key])),
  );
  byId('tiers').replaceChildren(
    ...book.discountTiers.map((tier, index) => tierRow(tier, book.discountTiers[index + 1])),
  );
  const rows = book.materials.map((item, index) => materialRow(item, index, book.materials[index - 1]));
  byId('materials').replaceChildren(materialsHead(), el('tbody', {}, rows));

  const tableError = byId('materials-error');
  tableError.hidden = true;
  tableError.textContent = '';
}

/**
 * Mark a price field as wrong (with a message) or as fine (with "").
 * @param {HTMLInputElement} input
 * @param {string} message
 */
export function showPriceError(input, message) {
  input.setAttribute('aria-invalid', String(message !== ''));

  const isSetting = Boolean(input.dataset.setting);
  const target = isSetting ? input.closest('.setting').querySelector('.field-error') : byId('materials-error');
  const otherBadCell = !isSetting && byId('materials').querySelector('[aria-invalid="true"]');
  if (message === '' && otherBadCell) return;

  target.textContent = message;
  target.hidden = message === '';
}
