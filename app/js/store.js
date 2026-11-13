// Keeps the price book and saved quotes in the browser's storage.
// Storage is outside our control, so everything read from it is checked,
// and every failure comes back as a plain message instead of an exception.

import { isIsoDate } from './dates.js';
import { DEFAULT_PRICE_BOOK, validatePriceBook } from './price-book.js';

/** @typedef {import('./price-book.js').PriceBook} PriceBook */
/** @typedef {import('./quote-math.js').Quote} Quote */
/** @typedef {{ savedAt: string, totalCents: number, quote: Quote }} QuoteRecord */
/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} KeyValueStorage */

export const STORAGE_KEYS = Object.freeze({
  priceBook: 'northgate.priceBook.v1',
  quotes: 'northgate.quotes.v1',
  quotesBackup: 'northgate.quotes.v1.backup',
  nextNumber: 'northgate.nextQuoteNumber.v1',
});

const QUOTE_PREFIX = 'NL-';
const QUOTE_NUMBER = /^NL-(\d+)$/;
const FIRST_QUOTE_NUMBER = 1001;

const MESSAGES = Object.freeze({
  blocked: 'This browser is blocking storage, so changes will not be kept after you close the page.',
  pricesDamaged: 'Your saved prices could not be read, so the sample prices are shown.',
  quotesDamaged: 'Your saved quotes could not be read.',
  quoteNotSaved: 'The quote could not be saved. This browser is blocking storage.',
  pricesNotSaved: 'The prices could not be saved. This browser is blocking storage.',
  quoteNotDeleted: 'The quote could not be deleted. This browser is blocking storage.',
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const numberOf = (quoteNumber) => Number(QUOTE_NUMBER.exec(quoteNumber)?.[1] ?? 0);

const LINE_TEXT_FIELDS = Object.freeze(['id', 'partName', 'material']);
const LINE_NUMBER_FIELDS = Object.freeze(['thickness', 'widthMm', 'heightMm', 'cutLengthMm', 'pierces', 'quantity']);
const MAX_STORED_LINES = 500;

/** @returns {boolean} true when a stored part has every field, with the right kind of value */
function isStoredLine(line) {
  if (!isPlainObject(line) || line.id === '') return false;
  const textOk = LINE_TEXT_FIELDS.every((field) => typeof line[field] === 'string');
  const numbersOk = LINE_NUMBER_FIELDS.every((field) => typeof line[field] === 'number' && Number.isFinite(line[field]));
  return textOk && numbersOk;
}

/** @returns {boolean} true when the parts are well formed and no two share an id */
function areStoredLines(lines) {
  if (!Array.isArray(lines) || lines.length > MAX_STORED_LINES || !lines.every(isStoredLine)) return false;
  return new Set(lines.map((line) => line.id)).size === lines.length;
}

/** @returns {boolean} true when a stored value has the shape of a saved quote */
function isQuoteRecord(value) {
  if (!isPlainObject(value) || !isPlainObject(value.quote)) return false;
  const { quote } = value;
  const linesOk = areStoredLines(quote.lines);
  return (
    typeof value.savedAt === 'string' &&
    Number.isInteger(value.totalCents) &&
    value.totalCents >= 0 &&
    typeof quote.number === 'string' &&
    QUOTE_NUMBER.test(quote.number) &&
    typeof quote.customer === 'string' &&
    isIsoDate(quote.date) &&
    typeof quote.rush === 'boolean' &&
    linesOk
  );
}

/** Newest first; quotes saved at the same moment go by number, highest first. */
function newestFirst(records) {
  return [...records].sort(
    (a, b) => b.savedAt.localeCompare(a.savedAt) || numberOf(b.quote.number) - numberOf(a.quote.number),
  );
}

/**
 * @param {KeyValueStorage} storage
 * @param {string} key
 * @returns {{ status: 'empty' } | { status: 'ok', value: unknown } | { status: 'damaged' } | { status: 'blocked' }}
 */
function readJson(storage, key) {
  let text;
  try {
    text = storage.getItem(key);
  } catch {
    return { status: 'blocked' };
  }
  if (text === null) return { status: 'empty' };
  try {
    return { status: 'ok', value: JSON.parse(text) };
  } catch {
    return { status: 'damaged' };
  }
}

/**
 * @param {KeyValueStorage} storage
 * @returns {{ quotes: QuoteRecord[], warning?: string }}
 */
function readQuotes(storage) {
  const read = readJson(storage, STORAGE_KEYS.quotes);
  if (read.status === 'empty') return { quotes: [] };
  if (read.status === 'blocked') return { quotes: [], warning: MESSAGES.blocked };
  if (read.status === 'damaged' || !Array.isArray(read.value)) return { quotes: [], warning: MESSAGES.quotesDamaged };

  const quotes = newestFirst(read.value.filter(isQuoteRecord));
  const dropped = read.value.length - quotes.length;
  if (dropped === 0) return { quotes };

  const what = dropped === 1 ? '1 saved quote was' : `${dropped} saved quotes were`;
  return { quotes, warning: `${what} damaged and left out of the list.` };
}

/**
 * Before the quote list is rewritten, keep the stored text aside if any of it could not be read,
 * so a damaged quote is never silently destroyed. Throws when storage refuses the write.
 * @param {KeyValueStorage} storage
 * @param {string} [warning] set when readQuotes left something out
 */
function backUpDamagedQuotes(storage, warning) {
  if (!warning) return;
  const raw = storage.getItem(STORAGE_KEYS.quotes);
  if (raw !== null) storage.setItem(STORAGE_KEYS.quotesBackup, raw);
}

/** The next free number: never lower than the counter, never a number already in use. */
function nextQuoteNumber(storage, quotes) {
  const counter = readJson(storage, STORAGE_KEYS.nextNumber);
  const fromCounter = counter.status === 'ok' && Number.isInteger(counter.value) ? counter.value : FIRST_QUOTE_NUMBER;
  const afterHighest = Math.max(0, ...quotes.map((record) => numberOf(record.quote.number))) + 1;
  return Math.max(fromCounter, afterHighest, FIRST_QUOTE_NUMBER);
}

/**
 * @param {KeyValueStorage} storage usually window.localStorage
 */
export function createStore(storage) {
  /** @returns {{ book: PriceBook, warning?: string }} */
  function loadPriceBook() {
    const read = readJson(storage, STORAGE_KEYS.priceBook);
    if (read.status === 'empty') return { book: DEFAULT_PRICE_BOOK };
    if (read.status === 'blocked') return { book: DEFAULT_PRICE_BOOK, warning: MESSAGES.blocked };
    if (read.status === 'damaged') return { book: DEFAULT_PRICE_BOOK, warning: MESSAGES.pricesDamaged };

    const checked = validatePriceBook(read.value);
    return checked.ok ? { book: checked.book } : { book: DEFAULT_PRICE_BOOK, warning: MESSAGES.pricesDamaged };
  }

  /**
   * @param {PriceBook} book
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  function savePriceBook(book) {
    try {
      storage.setItem(STORAGE_KEYS.priceBook, JSON.stringify(book));
      return { ok: true };
    } catch {
      return { ok: false, error: MESSAGES.pricesNotSaved };
    }
  }

  /** @returns {{ ok: true } | { ok: false, error: string }} */
  function resetPriceBook() {
    try {
      storage.removeItem(STORAGE_KEYS.priceBook);
      return { ok: true };
    } catch {
      return { ok: false, error: MESSAGES.pricesNotSaved };
    }
  }

  /** @returns {{ quotes: QuoteRecord[], warning?: string }} */
  function listQuotes() {
    return readQuotes(storage);
  }

  /**
   * Save a quote. A draft gets the next number; a numbered quote replaces its earlier copy.
   * @param {{ quote: Quote, totalCents: number, savedAt: string }} input
   * @returns {{ ok: true, record: QuoteRecord } | { ok: false, error: string }}
   */
  function saveQuote({ quote, totalCents, savedAt }) {
    try {
      const { quotes, warning } = readQuotes(storage);
      const isNew = quote.number === null;
      const next = nextQuoteNumber(storage, quotes);
      const number = isNew ? `${QUOTE_PREFIX}${next}` : quote.number;
      const record = { savedAt, totalCents, quote: { ...quote, number } };
      const others = quotes.filter((existing) => existing.quote.number !== number);

      // The number is reserved first: a failure after this leaves a gap, never two quotes with one number.
      if (isNew) storage.setItem(STORAGE_KEYS.nextNumber, JSON.stringify(next + 1));
      backUpDamagedQuotes(storage, warning);
      storage.setItem(STORAGE_KEYS.quotes, JSON.stringify([record, ...others]));
      return { ok: true, record };
    } catch {
      return { ok: false, error: MESSAGES.quoteNotSaved };
    }
  }

  /**
   * @param {string} number
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  function deleteQuote(number) {
    try {
      const { quotes, warning } = readQuotes(storage);
      const kept = quotes.filter((record) => record.quote.number !== number);
      backUpDamagedQuotes(storage, warning);
      storage.setItem(STORAGE_KEYS.quotes, JSON.stringify(kept));
      return { ok: true };
    } catch {
      return { ok: false, error: MESSAGES.quoteNotDeleted };
    }
  }

  return Object.freeze({ loadPriceBook, savePriceBook, resetPriceBook, listQuotes, saveQuote, deleteQuote });
}
