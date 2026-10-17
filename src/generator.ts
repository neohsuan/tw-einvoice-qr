import { fail, requireString } from './errors.js';
import { dateParts } from './period.js';
import { parsePrefix } from './parser.js';
import { businessNumber, invoiceParts, validateEncryption } from './validation.js';
import type { LeftQrPrefixFields } from './types.js';

function amountHex(value: number | null, sales = false): string {
  if (value === null && sales) return '00000000';
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    fail('INVALID_AMOUNT', 'Prefix amounts must be unsigned 32-bit integers (sales may be null).');
  }
  return value.toString(16).toUpperCase().padStart(8, '0');
}

/** Build and validate a 77-character prefix for fixtures; no encryption is generated.
 * date is ISO YYYY-MM-DD, null buyer means consumer, and null randomCode means
 * the four-space B2B representation. Zero amounts also support overseas fixtures.
 */
export function buildLeftQrPrefix(fields: LeftQrPrefixFields): string {
  if (!fields || typeof fields !== 'object') fail('INVALID_INPUT', 'Expected prefix fields.');
  for (const key of ['invoiceNumber', 'sellerIdentifier', 'encryption', 'date'] as const) requireString(fields[key], key);
  if (fields.buyerIdentifier !== null) requireString(fields.buyerIdentifier, 'buyerIdentifier');
  if (fields.randomCode !== null) requireString(fields.randomCode, 'randomCode');
  invoiceParts(fields.invoiceNumber);
  businessNumber(fields.buyerIdentifier ?? '00000000', true);
  businessNumber(fields.sellerIdentifier, false);
  validateEncryption(fields.encryption);
  if (fields.randomCode !== null && !/^\d{4}$/.test(fields.randomCode)) {
    fail('INVALID_RANDOM_CODE', 'Random code must contain four digits or be null for B2B.');
  }
  const { year, month, day } = dateParts(fields.date);
  const rocDate = `${String(year - 1911).padStart(3, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const prefix = fields.invoiceNumber + rocDate + (fields.randomCode ?? '    ')
    + amountHex(fields.salesAmount, true) + amountHex(fields.totalAmount)
    + (fields.buyerIdentifier ?? '00000000') + fields.sellerIdentifier + fields.encryption;
  if (prefix.length !== 77) fail('INVALID_QR_PREFIX', 'Fields must produce exactly 77 characters.');
  parsePrefix(prefix);
  return prefix;
}
