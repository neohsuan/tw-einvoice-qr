import { fail, requireString } from './errors.js';
import type { ClaimPeriod, DateInput, InvoicePeriod, PeriodInput } from './types.js';

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateParts(input: DateInput): { year: number; month: number; day: number } {
  const value = input instanceof Date
    ? (Number.isFinite(input.getTime()) ? input.toISOString().slice(0, 10) : '')
    : input;
  requireString(value, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_DATE', 'Date must be a valid YYYY-MM-DD calendar date.');
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1912 || year > 2910 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) {
    fail('INVALID_DATE', 'Date must be valid and have a three-digit positive ROC year (001–999).');
  }
  return { year, month, day };
}

export function periodFromCode(code: string): InvoicePeriod {
  if (!/^\d{5}$/.test(code)) fail('INVALID_PERIOD', 'Period code must contain three ROC year digits and two month digits.');
  const rocYear = Number(code.slice(0, 3));
  const endMonth = Number(code.slice(3));
  if (rocYear < 1 || endMonth < 2 || endMonth > 12 || endMonth % 2 !== 0) {
    fail('INVALID_PERIOD', 'Period must have a positive ROC year and an even month from 02 to 12.');
  }
  return { rocYear, year: rocYear + 1911, startMonth: endMonth - 1, endMonth };
}

function resolvePeriod(input: PeriodInput): InvoicePeriod {
  if (typeof input === 'string') {
    if (input.length === 19) {
      if (!/^\d{5}[A-Z]{2}\d{12}$/.test(input)) fail('INVALID_BARCODE', 'Invalid 19-character barcode.');
      return periodFromCode(input.slice(0, 5));
    }
    return periodFromCode(input);
  }
  if (!input || typeof input !== 'object') fail('INVALID_PERIOD', 'Expected an invoice period or period code.');
  const { rocYear, year, startMonth, endMonth } = input;
  if (!Number.isInteger(rocYear) || rocYear < 1 || rocYear > 999 || year !== rocYear + 1911
      || !Number.isInteger(endMonth) || endMonth < 2 || endMonth > 12 || endMonth % 2 !== 0
      || startMonth !== endMonth - 1) fail('INVALID_PERIOD', 'Invoice period fields are inconsistent.');
  return { rocYear, year, startMonth, endMonth };
}

/** Find the Jan–Feb, Mar–Apr, … invoice period containing a date. */
export function getPeriod(date: DateInput): InvoicePeriod {
  const { year, month } = dateParts(date);
  const endMonth = Math.ceil(month / 2) * 2;
  return { rocYear: year - 1911, year, startMonth: endMonth - 1, endMonth };
}

/** Compare a calendar date to a parsed period, ROC period code, or barcode.
 * Invalid inputs throw InvoiceParseError rather than silently returning false.
 */
export function isPeriodMatch(date: DateInput, period: PeriodInput): boolean {
  const actual = getPeriod(date);
  const expected = resolvePeriod(period);
  return actual.year === expected.year && actual.endMonth === expected.endMonth;
}

/** ISO draw date: the 25th of the odd month immediately after the period. */
export function getDrawDate(period: PeriodInput): string {
  const { year, endMonth } = resolvePeriod(period);
  return isoDate(year + (endMonth === 12 ? 1 : 0), endMonth === 12 ? 1 : endMonth + 1, 25);
}

/** Inclusive nominal claim dates, starting on the 6th after the draw month.
 * Returns the calendar window only; official holiday extensions are not applied.
 */
export function getClaimPeriod(period: PeriodInput): ClaimPeriod {
  const resolved = resolvePeriod(period);
  const startIndex = resolved.year * 12 + resolved.endMonth + 1;
  const endIndex = startIndex + 3;
  return {
    startDate: isoDate(Math.floor(startIndex / 12), startIndex % 12 + 1, 6),
    endDate: isoDate(Math.floor(endIndex / 12), endIndex % 12 + 1, 5),
  };
}
