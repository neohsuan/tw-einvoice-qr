import { fail, requireString } from './errors.js';

/** Check a Taiwan business number using the 2023 divisor-5 rule and digit-7 exception.
 * This checks syntax/checksum only, not whether the number has been issued.
 * The all-zero consumer sentinel is not a business number.
 */
export function isValidBusinessNumber(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value) || value === '00000000') return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = Number(value[i]) * weights[i]!;
    sum += Math.floor(product / 10) + product % 10;
  }
  // For digit 7 = 7, reducing 28 -> 10 -> 1 changes the sum by -9.
  return sum % 5 === 0 || (value[6] === '7' && (sum + 1) % 5 === 0);
}

export function invoiceParts(value: string): { invoiceNumber: string; track: string; number: string } {
  requireString(value, 'invoiceNumber');
  if (!/^[A-Z]{2}\d{8}$/.test(value)) {
    fail('INVALID_INVOICE_NUMBER', 'Invoice number must contain two uppercase letters and eight digits.');
  }
  return { invoiceNumber: value, track: value.slice(0, 2), number: value.slice(2) };
}

export function businessNumber(value: string, buyer: boolean): string | null {
  if (buyer && value === '00000000') return null;
  if (!isValidBusinessNumber(value)) {
    fail('INVALID_BUSINESS_NUMBER', `${buyer ? 'Buyer' : 'Seller'} business number has invalid syntax or checksum.`);
  }
  return value;
}

export function hexAmount(value: string): number {
  if (!/^[0-9a-fA-F]{8}$/.test(value)) fail('INVALID_AMOUNT', 'Amounts must contain exactly eight hexadecimal digits.');
  return Number.parseInt(value, 16);
}

export function validateTotals(sales: number | null, total: number): void {
  if (sales !== null && total < sales) fail('TOTAL_BELOW_SALES', 'Total amount cannot be less than sales amount.');
}

/** Strict canonical RFC 4648 Base64; no whitespace or URL-safe alphabet. */
export function base64Bytes(value: string, code: 'INVALID_BASE64' | 'INVALID_ENCRYPTION'): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(code, 'Expected canonical padded Base64.');
  }
  const binary = atob(value);
  if (btoa(binary) !== value) fail(code, 'Base64 contains nonzero padding bits.');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function validateEncryption(value: string): void {
  if (value.length !== 24 || base64Bytes(value, 'INVALID_ENCRYPTION').length !== 16) {
    fail('INVALID_ENCRYPTION', 'Encryption must be 24 Base64 characters representing 16 bytes.');
  }
}
