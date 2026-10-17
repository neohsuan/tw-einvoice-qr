import { fail, requireString } from './errors.js';
import { invoiceParts } from './validation.js';
import type { Prize, PrizeResult, WinningNumbers } from './types.js';

const tiers: readonly [Prize, string, number, number][] = [
  ['first', '頭獎', 200_000, 8], ['second', '二獎', 40_000, 7],
  ['third', '三獎', 10_000, 6], ['fourth', '四獎', 4_000, 5],
  ['fifth', '五獎', 1_000, 4], ['sixth', '六獎', 200, 3],
];

function winningNumber(value: string, digits: number): void {
  if (typeof value !== 'string' || !(digits === 8 ? /^\d{8}$/ : /^\d{3}$/).test(value)) {
    fail('INVALID_WINNING_NUMBER', `Winning number must contain exactly ${digits} digits.`);
  }
}

/** Find the single highest statutory prize (rules verified 2026-10-17).
 * Only first-prize numbers produce suffix prizes. Cloud-only prizes, eligibility,
 * tax withholding, and claim validity are outside this numeric comparison.
 */
export function checkPrize(invoiceNumberOr8Digits: string, winning: WinningNumbers): PrizeResult {
  requireString(invoiceNumberOr8Digits, 'invoice number');
  const number = /^\d{8}$/.test(invoiceNumberOr8Digits)
    ? invoiceNumberOr8Digits : invoiceParts(invoiceNumberOr8Digits).number;
  if (!winning || !Array.isArray(winning.first)) fail('INVALID_WINNING_NUMBER', 'winning.first must be an array of eight-digit numbers.');
  if (winning.additionalSixth !== undefined && !Array.isArray(winning.additionalSixth)) {
    fail('INVALID_WINNING_NUMBER', 'winning.additionalSixth must be an array of three-digit numbers.');
  }
  if (winning.special !== undefined) winningNumber(winning.special, 8);
  if (winning.grand !== undefined) winningNumber(winning.grand, 8);
  for (const first of winning.first) winningNumber(first, 8);
  for (const sixth of winning.additionalSixth ?? []) winningNumber(sixth, 3);
  if (winning.special === number) return { prize: 'special', nameZh: '特別獎', amount: 10_000_000, matched: number };
  if (winning.grand === number) return { prize: 'grand', nameZh: '特獎', amount: 2_000_000, matched: number };
  for (const [prize, nameZh, amount, length] of tiers) {
    const matched = winning.first.find((first) => first.slice(-length) === number.slice(-length));
    if (matched !== undefined) return { prize, nameZh, amount, matched };
  }
  const additional = winning.additionalSixth?.find((sixth) => number.endsWith(sixth));
  if (additional !== undefined) return { prize: 'additionalSixth', nameZh: '增開六獎', amount: 200, matched: additional };
  return { prize: 'none', nameZh: '未中獎', amount: 0, matched: null };
}
