const CENTS_PER_UNIT = 100;
const SECONDS_PER_MINUTE = 60;

/**
 * @param {number} cents a whole number of cents
 * @param {string} [symbol]
 * @returns {string} for example "$1,234.56"
 */
export function formatCents(cents, symbol = '$') {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / CENTS_PER_UNIT).toLocaleString('en-US');
  const rest = String(absolute % CENTS_PER_UNIT).padStart(2, '0');
  return `${sign}${symbol}${whole}.${rest}`;
}

/**
 * @param {number} minutes
 * @returns {string} seconds under one minute ("32 s"), otherwise minutes ("5.9 min")
 */
export function formatMinutes(minutes) {
  const seconds = Math.round(minutes * SECONDS_PER_MINUTE);
  if (seconds < SECONDS_PER_MINUTE) return `${seconds} s`;
  return `${minutes.toFixed(1)} min`;
}
