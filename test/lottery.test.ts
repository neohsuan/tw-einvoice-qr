import { describe, expect, it } from 'vitest';
import { checkPrize, InvoiceParseError } from '../src/index.js';
import type { WinningNumbers } from '../src/index.js';

const winning: WinningNumbers = {
  special: '12345678', grand: '87654321', first: ['01234567', '76543210', '33333333'],
  additionalSixth: ['888', '999'],
};

describe('invoice lottery', () => {
  it.each([
    ['12345678', 'special', '特別獎', 10_000_000, '12345678'],
    ['AB87654321', 'grand', '特獎', 2_000_000, '87654321'],
    ['AB01234567', 'first', '頭獎', 200_000, '01234567'],
    ['91234567', 'second', '二獎', 40_000, '01234567'],
    ['99234567', 'third', '三獎', 10_000, '01234567'],
    ['99934567', 'fourth', '四獎', 4_000, '01234567'],
    ['99994567', 'fifth', '五獎', 1_000, '01234567'],
    ['99999567', 'sixth', '六獎', 200, '01234567'],
    ['00000888', 'additionalSixth', '增開六獎', 200, '888'],
    ['AB00000999', 'additionalSixth', '增開六獎', 200, '999'],
    ['00000000', 'none', '未中獎', 0, null],
  ] as const)('returns %s -> %s', (number, prize, nameZh, amount, matched) => {
    expect(checkPrize(number, winning)).toEqual({ prize, nameZh, amount, matched });
  });
  it('chooses the highest match across all first numbers, independent of array order', () => {
    const result = checkPrize('01234567', { first: ['99999567', '91234567', '01234567'] });
    expect(result).toMatchObject({ prize: 'first', amount: 200_000, matched: '01234567' });
  });
  it('gives special and grand priority when identical winning numbers overlap', () => {
    expect(checkPrize('01234567', { special: '01234567', grand: '01234567', first: ['01234567'] }).prize).toBe('special');
    expect(checkPrize('01234567', { grand: '01234567', first: ['01234567'] }).prize).toBe('grand');
  });
  it('does not award suffix prizes for special or grand numbers', () => {
    expect(checkPrize('00000678', { ...winning, first: [] }).prize).toBe('none');
    expect(checkPrize('00000321', { ...winning, first: [] }).prize).toBe('none');
  });
  it('handles absent extra numbers and an empty first array', () => {
    expect(checkPrize('00000000', { first: [] })).toEqual({ prize: 'none', nameZh: '未中獎', amount: 0, matched: null });
    expect(checkPrize('00000999', { first: ['01234567'] }).prize).toBe('none');
  });
  it('returns the ordinary sixth prize when both sixth sources match', () => {
    expect(checkPrize('99999567', { first: ['01234567'], additionalSixth: ['567'] }).prize).toBe('sixth');
  });
  it.each(['1234567', '123456789', 'ab12345678', 'AB1234567x', ' 01234567', '１２３４５６７８'])(
    'rejects malformed invoice %s', (number) => expect(() => checkPrize(number, winning)).toThrow(InvoiceParseError),
  );
  it.each([
    { first: ['123'] }, { first: [], special: '1234567' }, { first: [], grand: '0123456x' },
    { first: [], additionalSixth: ['1234'] }, { first: [], additionalSixth: ['12x'] },
    { first: null }, { first: [], additionalSixth: '123' },
  ])('validates all supplied winning numbers: %j', (value) => {
    expect(() => checkPrize('12345678', value as WinningNumbers)).toThrow(InvoiceParseError);
  });
});
