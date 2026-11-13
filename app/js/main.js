// Wires the page together: one state object, pure updates, and views that redraw from it.

import { todayIso } from './dates.js';
import { byId, setValue } from './dom.js';
import { formatCents } from './money.js';
import { DEFAULT_PRICE_BOOK, withMaterialValue, withSetting } from './price-book.js';
import { priceQuote } from './quote-math.js';
import { addLine, duplicateLine, newQuote, removeLine, setQuoteField, updateLine } from './quote-state.js';
import { quoteAsText } from './quote-text.js';
import { SAMPLE_CUSTOMER, SAMPLE_PARTS } from './sample-quote.js';
import { createStore } from './store.js';
import { readLineField, syncLines } from './view-lines.js';
import { renderPrices, showPriceError } from './view-prices.js';
import { syncPrintSheet } from './view-print.js';
import { renderSaved } from './view-saved.js';
import { quoteBlocker, syncQuoteHead, syncTicket } from './view-ticket.js';

const VIEWS = Object.freeze(['quote', 'saved', 'prices']);
const TOAST_MS = 2600;
const ERROR_TOAST_MS = 6000;
const LEAVE_QUESTION = 'This quote has changes that are not saved. Leave it anyway?';

/** Reading localStorage can itself throw in private modes; give the store one that fails politely. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    const blocked = () => {
      throw new Error('Storage is blocked');
    };
    return { getItem: blocked, setItem: blocked, removeItem: blocked };
  }
}

let idCount = 0;
function newId() {
  idCount += 1;
  return globalThis.crypto?.randomUUID?.() ?? `part-${Date.now()}-${idCount}`;
}

const store = createStore(browserStorage());
/** @type {{ book: object, quote: object, saved: object[], dirty: boolean }} */
let state;
let toastTimer = 0;

function render() {
  const { quote, book, dirty } = state;
  const priced = priceQuote(quote, book);
  setValue(byId('customer'), quote.customer);
  setValue(byId('quote-date'), quote.date);
  syncQuoteHead(quote, dirty);
  syncLines(byId('lines'), quote, book);
  syncTicket(quote, priced, book);
  syncPrintSheet(quote, priced, book);
}

function setState(patch) {
  state = Object.freeze({ ...state, ...patch });
  render();
}

function showNotice(text) {
  const notice = byId('notice');
  notice.textContent = text;
  notice.hidden = text === '';
}

/** Show a short message at the bottom of the screen. Errors stay up longer so they can be read. */
function toast(text, isError = false) {
  const node = byId('toast');
  node.textContent = text;
  node.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('is-on'), isError ? ERROR_TOAST_MS : TOAST_MS);
}

function editQuote(next) {
  if (next !== state.quote) setState({ quote: next, dirty: true });
}

const canLeaveQuote = () => !state.dirty || window.confirm(LEAVE_QUESTION);

function onLinesInput(event) {
  const control = event.target;
  const card = control.closest('.line');
  if (!card || !control.dataset.field) return;
  editQuote(updateLine(state.quote, state.book, card.dataset.id, control.dataset.field, readLineField(control)));
}

function onLinesClick(event) {
  const button = event.target.closest('button[data-action]');
  const card = button?.closest('.line');
  if (!card) return;
  if (button.dataset.action === 'duplicate') editQuote(duplicateLine(state.quote, card.dataset.id, newId()));
  if (button.dataset.action === 'remove') {
    editQuote(removeLine(state.quote, card.dataset.id));
    byId('add-line').focus();
  }
}

function addPart() {
  editQuote(addLine(state.quote, state.book, newId()));
  byId('lines').lastElementChild?.querySelector('[data-field="partName"]')?.focus();
}

function startFresh() {
  if (!canLeaveQuote()) return;
  showNotice('');
  setState({ quote: newQuote(todayIso(), state.book, newId()), dirty: false });
}

function loadSample() {
  if (!canLeaveQuote()) return;
  const lines = SAMPLE_PARTS.map((part) => ({ id: newId(), ...part }));
  showNotice('');
  // Not marked as changed: the sample can be loaded again at any time, so nothing of the user's is lost.
  setState({ quote: { number: null, customer: SAMPLE_CUSTOMER, date: todayIso(), rush: false, lines }, dirty: false });
}

function saveCurrent() {
  const priced = priceQuote(state.quote, state.book);
  if (!priced.ok || quoteBlocker(state.quote, priced) !== '') return;

  const saved = store.saveQuote({ quote: state.quote, totalCents: priced.totalCents, savedAt: new Date().toISOString() });
  if (!saved.ok) {
    toast(saved.error, true);
    return;
  }
  showNotice('');
  setState({ quote: saved.record.quote, saved: store.listQuotes().quotes, dirty: false });
  renderSaved(state.saved, state.book.currency);
  toast(`Saved as ${saved.record.quote.number}`);
}

/** On small screens the ticket sits under the parts; the total bar jumps down to it. */
function showTicket() {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  byId('ticket-heading').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}

/** Tell the owner when today's prices give a different total than the one saved. */
function priceChangeNotice(record) {
  const priced = priceQuote(record.quote, state.book);
  if (!priced.ok) return 'Some parts of this quote no longer match the price list. Fix the marked fields.';
  if (priced.totalCents === record.totalCents) return '';
  const money = (cents) => formatCents(cents, state.book.currency);
  const { number } = record.quote;
  return `Prices have changed since ${number} was saved. It was ${money(record.totalCents)}; it is now ${money(priced.totalCents)}.`;
}

/** While a saved quote is open, keep the "prices have changed" notice in step with the price book. */
function refreshPriceNotice() {
  const record = state.saved.find((item) => item.quote.number === state.quote.number);
  if (record) showNotice(priceChangeNotice(record));
}

function openSaved(number) {
  const record = state.saved.find((item) => item.quote.number === number);
  if (!record || !canLeaveQuote()) return;
  setState({ quote: record.quote, dirty: false });
  showNotice(priceChangeNotice(record));
  window.location.hash = '#quote';
}

function deleteSaved(number) {
  if (!window.confirm(`Delete quote ${number}? This cannot be undone.`)) return;
  const removed = store.deleteQuote(number);
  if (!removed.ok) {
    toast(removed.error, true);
    return;
  }
  // If the deleted quote is the one on screen, it becomes an unsaved draft again,
  // so leaving it must ask first: the screen now holds the only copy.
  const wasOpen = state.quote.number === number;
  const quote = wasOpen ? { ...state.quote, number: null } : state.quote;
  if (wasOpen) showNotice('');
  setState({ quote, saved: store.listQuotes().quotes, dirty: state.dirty || wasOpen });
  renderSaved(state.saved, state.book.currency);
  byId('saved-heading').focus();
  toast(`${number} deleted`);
}

function onSavedClick(event) {
  const button = event.target.closest('button[data-action]');
  const number = button?.closest('.saved-item')?.dataset.number;
  if (!number) return;
  if (button.dataset.action === 'open') openSaved(number);
  if (button.dataset.action === 'delete') deleteSaved(number);
}

async function copyQuote() {
  const text = quoteAsText(state.quote, priceQuote(state.quote, state.book), state.book);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('Quote copied. Paste it into an email.');
  } catch {
    toast('This browser blocked copying. Use Print / PDF instead.', true);
  }
}

function onPriceInput(event) {
  const input = event.target;
  const { setting, key, row } = input.dataset;
  if (!setting && !key) return;

  const value = input.value === '' ? Number.NaN : Number(input.value);
  const change = setting ? withSetting(state.book, setting, value) : withMaterialValue(state.book, Number(row), key, value);
  showPriceError(input, change.ok ? '' : change.error);
  if (!change.ok) return;

  const saved = store.savePriceBook(change.book);
  setState({ book: change.book });
  refreshPriceNotice();
  if (!saved.ok) toast(saved.error, true);
}

function resetPrices() {
  if (!window.confirm('Go back to the sample prices? Your price changes will be lost.')) return;
  const reset = store.resetPriceBook();
  if (!reset.ok) toast(reset.error, true);
  setState({ book: DEFAULT_PRICE_BOOK });
  renderPrices(state.book);
  refreshPriceNotice();
}

function currentView() {
  const name = window.location.hash.slice(1);
  return VIEWS.includes(name) ? name : 'quote';
}

function showView(moveFocus) {
  const view = currentView();
  VIEWS.forEach((name) => {
    byId(`view-${name}`).hidden = name !== view;
  });
  document.querySelectorAll('.tabs a').forEach((tab) => {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  if (view === 'prices') renderPrices(state.book);
  if (moveFocus) byId(`${view}-heading`).focus();
}

function wireEvents() {
  const onClick = (id, handler) => byId(id).addEventListener('click', handler);
  const onQuoteField = (id, eventName, field, read) =>
    byId(id).addEventListener(eventName, (event) => editQuote(setQuoteField(state.quote, field, read(event.target))));

  byId('lines').addEventListener('input', onLinesInput);
  byId('lines').addEventListener('click', onLinesClick);
  onQuoteField('customer', 'input', 'customer', (input) => input.value);
  onQuoteField('quote-date', 'input', 'date', (input) => input.value);
  onQuoteField('rush', 'change', 'rush', (input) => input.checked);
  onClick('add-line', addPart);
  onClick('new-quote', startFresh);
  onClick('load-sample', loadSample);
  onClick('save-quote', saveCurrent);
  onClick('print-quote', () => window.print());
  onClick('copy-quote', copyQuote);
  onClick('reset-prices', resetPrices);
  onClick('total-bar', showTicket);
  byId('saved-list').addEventListener('click', onSavedClick);
  byId('view-prices').addEventListener('input', onPriceInput);
  window.addEventListener('hashchange', () => showView(true));
  // Closing or reloading the tab with unsaved changes asks first, like the in-app buttons do.
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function start() {
  const loadedBook = store.loadPriceBook();
  const loadedQuotes = store.listQuotes();
  state = Object.freeze({
    book: loadedBook.book,
    quote: newQuote(todayIso(), loadedBook.book, newId()),
    saved: loadedQuotes.quotes,
    dirty: false,
  });
  const warnings = [...new Set([loadedBook.warning, loadedQuotes.warning].filter(Boolean))];

  wireEvents();
  render();
  renderSaved(state.saved, state.book.currency);
  showView(false);
  showNotice(warnings.join(' '));
}

try {
  start();
} catch (error) {
  console.error('The quote desk could not start', error);
  const message = document.createElement('p');
  message.className = 'notice';
  message.textContent = 'The quote desk could not start. Reload the page to try again.';
  document.body.prepend(message);
}
