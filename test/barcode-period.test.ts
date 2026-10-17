import { describe, expect, it } from 'vitest';
import {
  getClaimPeriod, getDrawDate, getPeriod, InvoiceParseError,
  isPeriodMatch, parseBarcode, safeParseBarcode,
} from '../src/index.js';

describe('Code 39', () => {
  it('parses the official example payload and leading zeroes', () => {
    expect(parseBarcode('10404UZ176908720122')).toEqual({
      period: { rocYear: 104, year: 2015, startMonth: 3, endMonth: 4 },
      invoiceNumber: 'UZ17690872', track: 'UZ', number: '17690872', randomCode: '0122',
    });
    expect(parseBarcode('11406AB000000010000').period).toEqual({ rocYear: 114, year: 2025, startMonth: 5, endMonth: 6 });
  });
  it.each(['11400', '11401', '11403', '11413', '11414', '00002', '11x02'])(
    'rejects invalid period %s', (period) => {
      const result = safeParseBarcode(`${period}AB123456780001`);
      expect(result).toMatchObject({ success: false, errors: [{ code: 'INVALID_PERIOD' }] });
    },
  );
  it.each(['', '*10404UZ176908720122*', '10404UZ17690872012', '10404UZ176908720122\n', ' 10404UZ176908720122'])(
    'requires exactly 19 characters: %j', (input) => expect(() => parseBarcode(input)).toThrow(InvoiceParseError),
  );
  it.each(['ab12345678', 'A112345678', 'AB1234567x', 'ＡＢ12345678'])(
    'rejects invoice number %s', (value) => {
      expect(safeParseBarcode(`11402${value}0001`)).toMatchObject({ success: false, errors: [{ code: 'INVALID_INVOICE_NUMBER' }] });
    },
  );
  it('rejects random-code spaces and non-string JS input', () => {
    expect(safeParseBarcode('11402AB12345678    ')).toMatchObject({ success: false, errors: [{ code: 'INVALID_RANDOM_CODE' }] });
    expect(safeParseBarcode(null as unknown as string)).toMatchObject({ success: false, errors: [{ code: 'INVALID_INPUT' }] });
  });
});

describe('period and dates', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('groups month %i into its even period', (month) => {
    const endMonth = Math.ceil(month / 2) * 2;
    expect(getPeriod(`2026-${String(month).padStart(2, '0')}-01`)).toEqual({
      rocYear: 115, year: 2026, startMonth: endMonth - 1, endMonth,
    });
  });
  it('validates leap years including Gregorian centuries', () => {
    expect(getPeriod('2000-02-29').endMonth).toBe(2);
    expect(getPeriod('2024-02-29').endMonth).toBe(2);
    expect(() => getPeriod('2100-02-29')).toThrow(InvoiceParseError);
  });
  it.each(['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-1-1', '2026-01-01T00:00:00Z', '1911-12-31', '2911-01-01'])(
    'rejects invalid date %s', (value) => expect(() => getPeriod(value)).toThrow(InvoiceParseError),
  );
  it('uses UTC calendar fields for Date inputs', () => {
    expect(getPeriod(new Date('2026-09-01T00:30:00+08:00')).endMonth).toBe(8);
    expect(() => getPeriod(new Date(NaN))).toThrow(InvoiceParseError);
  });
  it('checks period boundaries and barcode periods', () => {
    const period = getPeriod('2026-08-31');
    expect(isPeriodMatch('2026-07-01', period)).toBe(true);
    expect(isPeriodMatch('2026-08-31', '11508')).toBe(true);
    expect(isPeriodMatch('2026-08-31', '11508AB112233449999')).toBe(true);
    expect(isPeriodMatch('2026-09-01', period)).toBe(false);
    expect(isPeriodMatch('2025-08-31', period)).toBe(false);
  });
  it.each([
    ['11502', '2026-03-25', '2026-04-06', '2026-07-05'],
    ['11504', '2026-05-25', '2026-06-06', '2026-09-05'],
    ['11506', '2026-07-25', '2026-08-06', '2026-11-05'],
    ['11508', '2026-09-25', '2026-10-06', '2027-01-05'],
    ['11510', '2026-11-25', '2026-12-06', '2027-03-05'],
    ['11512', '2027-01-25', '2027-02-06', '2027-05-05'],
  ])('calculates draw and nominal claim dates for %s', (period, draw, startDate, endDate) => {
    expect(getDrawDate(period!)).toBe(draw);
    expect(getClaimPeriod(period!)).toEqual({ startDate, endDate });
    expect(getDrawDate(parseBarcode(`${period}AB112233449999`).period)).toBe(draw);
  });
  it('rejects internally inconsistent periods and malformed barcodes', () => {
    const period = getPeriod('2026-07-01');
    expect(() => getDrawDate({ ...period, year: 2025 })).toThrow(InvoiceParseError);
    expect(() => getDrawDate({ ...period, startMonth: 8 })).toThrow(InvoiceParseError);
    expect(() => getDrawDate({ ...period, endMonth: 7 })).toThrow(InvoiceParseError);
    expect(() => getDrawDate('11508ab112233449999')).toThrow(InvoiceParseError);
  });
});
