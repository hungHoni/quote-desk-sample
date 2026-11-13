// Dates are kept as plain "2026-11-12" strings so they never shift with time zones.

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const pad = (value) => String(value).padStart(2, '0');

/**
 * @param {unknown} value
 * @returns {{ year: number, month: number, day: number } | null} null unless it is a real calendar date
 */
function dateParts(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  const isReal = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  return isReal ? { year, month, day } : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isIsoDate(value) {
  return dateParts(value) !== null;
}

/**
 * @param {string} iso
 * @returns {string} for example "12 Nov 2026", or "" when the date is not valid
 */
export function formatDate(iso) {
  const parts = dateParts(iso);
  if (!parts) return '';
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/**
 * @param {string} iso
 * @param {number} days
 * @returns {string} the ISO date that many days later, or "" when the date is not valid
 */
export function addDays(iso, days) {
  const parts = dateParts(iso);
  if (!parts) return '';
  const later = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * MS_PER_DAY);
  return `${later.getUTCFullYear()}-${pad(later.getUTCMonth() + 1)}-${pad(later.getUTCDate())}`;
}

/**
 * @param {Date} [now]
 * @returns {string} today's date on the user's own clock
 */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
