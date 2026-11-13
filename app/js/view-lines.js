// The part cards. Cards are built once and then updated in place,
// so the field the user is typing in never loses its cursor.

import { el, setText, setValue } from './dom.js';
import { formatCents, formatMinutes } from './money.js';
import { materialNames, thicknessesFor } from './price-book.js';
import { MAX_PART_NAME, priceLine, toCents, validateLine } from './quote-math.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./quote-math.js').Quote} Quote */
/** @typedef {import('./quote-math.js').QuoteLine} QuoteLine */

const NUMBER_FIELDS = Object.freeze([
  { key: 'widthMm', label: 'Width', unit: 'mm', css: 'f-width' },
  { key: 'heightMm', label: 'Height', unit: 'mm', css: 'f-height' },
  { key: 'cutLengthMm', label: 'Cut length', unit: 'mm', css: 'f-cut' },
  { key: 'pierces', label: 'Pierces', unit: '', css: 'f-pierces' },
  { key: 'quantity', label: 'Quantity', unit: '', css: 'f-qty' },
]);
const TEXT_FIELDS = Object.freeze(['partName', 'material']);
const ALL_FIELDS = Object.freeze(['partName', 'material', 'thickness', ...NUMBER_FIELDS.map((field) => field.key)]);
const NOT_LISTED = ' (not in the price list)';

const numberText = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

function labelled(css, label, unit, control) {
  const caption = el('span', { class: 'f-label' }, unit ? [`${label} `, el('small', { text: unit })] : [label]);
  return el('label', { class: `f ${css}` }, [caption, control]);
}

function numberField(field) {
  const input = el('input', { type: 'number', step: 'any', inputMode: 'decimal', dataset: { field: field.key } });
  return labelled(field.css, field.label, field.unit, input);
}

const errorIdOf = (lineId) => `part-error-${lineId}`;

/** @returns {HTMLElement} an empty card for one part */
function buildLine(id) {
  const nameInput = el('input', {
    type: 'text',
    maxLength: MAX_PART_NAME,
    autocomplete: 'off',
    placeholder: 'Bracket, panel, sign…',
    dataset: { field: 'partName' },
  });
  return el('div', { class: 'line', role: 'group', dataset: { id } }, [
    el('span', { class: 'line-no' }),
    el('div', { class: 'line-actions' }, [
      el('button', { type: 'button', class: 'btn btn-mini', text: 'Duplicate', dataset: { action: 'duplicate' } }),
      el('button', { type: 'button', class: 'btn btn-mini', text: 'Remove', dataset: { action: 'remove' } }),
    ]),
    el('div', { class: 'line-grid' }, [
      labelled('f-name', 'Part', '', nameInput),
      labelled('f-material', 'Material', '', el('select', { dataset: { field: 'material' } })),
      labelled('f-thickness', 'Thickness', 'mm', el('select', { dataset: { field: 'thickness' } })),
      ...NUMBER_FIELDS.map(numberField),
    ]),
    el('p', { class: 'line-error', role: 'status', id: errorIdOf(id) }),
    el('div', { class: 'line-foot' }, [
      el('p', { class: 'line-how' }),
      el('p', { class: 'line-price' }, [el('span', { class: 'line-unit' }), el('strong', { class: 'line-total' })]),
    ]),
  ]);
}

/** Fill a dropdown. A value the price list no longer offers stays visible, marked, so it can be fixed. */
function syncOptions(select, offered, current) {
  const currentText = String(current);
  const values = offered.map(String);
  const all = values.includes(currentText) ? values : [...values, currentText];
  const shown = [...select.options].map((option) => option.value);

  if (all.join('\n') !== shown.join('\n')) {
    const label = (value) => (values.includes(value) ? value : `${value}${NOT_LISTED}`);
    select.replaceChildren(...all.map((value) => el('option', { value, text: label(value) })));
  }
  if (select.value !== currentText) select.value = currentText;
}

/** Show the price of a part, or what stops it from being priced. */
function syncPrice(node, line, errors, book) {
  const problems = Object.values(errors);
  setText(node.querySelector('.line-error'), problems.join(' · '));
  node.classList.toggle('has-error', problems.length > 0);

  const how = node.querySelector('.line-how');
  const unit = node.querySelector('.line-unit');
  const total = node.querySelector('.line-total');
  if (problems.length > 0) {
    setText(how, 'Fix the marked fields to price this part.');
    setText(unit, '');
    setText(total, '—');
    return;
  }

  const price = priceLine(line, book);
  const money = (cents) => formatCents(cents, book.currency);
  const discount = price.discountPercent > 0 ? ` · ${price.discountPercent}% quantity discount` : '';
  const material = money(toCents(price.materialCost));
  const cutting = `${formatMinutes(price.cutMinutes)} ≈ ${money(toCents(price.cutCost))}`;
  setText(how, `Each: material ≈ ${material} · cutting ${cutting}${discount}`);
  setText(unit, `${money(price.unitCents)} each`);
  setText(total, money(price.lineCents));
}

/** Flag a field as wrong and point assistive technology at the card's error message. */
function markField(control, isWrong, errorId) {
  control.setAttribute('aria-invalid', String(isWrong));
  if (isWrong) control.setAttribute('aria-describedby', errorId);
  else control.removeAttribute('aria-describedby');
}

function syncLine(node, line, index, book) {
  const control = (field) => node.querySelector(`[data-field="${field}"]`);
  const partNumber = index + 1;
  const errors = validateLine(line, book);

  node.setAttribute('aria-label', `Part ${partNumber}`);
  setText(node.querySelector('.line-no'), String(partNumber).padStart(2, '0'));
  node.querySelector('[data-action="duplicate"]').setAttribute('aria-label', `Duplicate part ${partNumber}`);
  node.querySelector('[data-action="remove"]').setAttribute('aria-label', `Remove part ${partNumber}`);

  setValue(control('partName'), typeof line.partName === 'string' ? line.partName : '');
  syncOptions(control('material'), materialNames(book), line.material);
  syncOptions(control('thickness'), thicknessesFor(book, line.material), line.thickness);
  NUMBER_FIELDS.forEach((field) => setValue(control(field.key), numberText(line[field.key])));
  ALL_FIELDS.forEach((field) => markField(control(field), field in errors, errorIdOf(line.id)));

  syncPrice(node, line, errors, book);
}

/**
 * Make the list of part cards match the quote.
 * @param {HTMLElement} list
 * @param {Quote} quote
 * @param {PriceBook} book
 */
export function syncLines(list, quote, book) {
  const existing = new Map([...list.children].map((node) => [node.dataset.id, node]));
  const wanted = new Set(quote.lines.map((line) => line.id));
  existing.forEach((node, id) => {
    if (!wanted.has(id)) node.remove();
  });

  quote.lines.forEach((line, index) => {
    const node = existing.get(line.id) ?? buildLine(line.id);
    if (list.children[index] !== node) list.insertBefore(node, list.children[index] ?? null);
    syncLine(node, line, index, book);
  });
}

/**
 * @param {HTMLInputElement | HTMLSelectElement} control a field inside a part card
 * @returns {string | number} text for names, a number (NaN when empty) for everything else
 */
export function readLineField(control) {
  if (TEXT_FIELDS.includes(control.dataset.field)) return control.value;
  return control.value === '' ? Number.NaN : Number(control.value);
}
