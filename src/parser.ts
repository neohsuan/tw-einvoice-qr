import { fail, InvoiceParseError, requireString, safe } from './errors.js';
import { dateParts, isoDate, isPeriodMatch, periodFromCode } from './period.js';
import { base64Bytes, businessNumber, hexAmount, invoiceParts, validateEncryption, validateTotals } from './validation.js';
import type {
  EncodingParameter, InvoiceItem, OverseasAmounts, ParsedBarcode, ParsedInvoiceQr,
  ParsedLeftQr, ParsedQrPrefix, ParsedRightQr, ParseInvoiceOptions, QrEncoding,
  SafeParseResult, ValidationIssue,
} from './types.js';

/** Parse the exact 19-character Code 39 payload, excluding start/stop asterisks. */
export function parseBarcode(code39String: string): ParsedBarcode {
  requireString(code39String, 'barcode');
  if (code39String.length !== 19) fail('INVALID_BARCODE', 'Barcode payload must contain exactly 19 characters.');
  const period = periodFromCode(code39String.slice(0, 5));
  const parts = invoiceParts(code39String.slice(5, 15));
  const randomCode = code39String.slice(15);
  if (!/^\d{4}$/.test(randomCode)) fail('INVALID_RANDOM_CODE', 'Barcode random code must contain four digits.');
  return { period, ...parts, randomCode };
}

export function parsePrefix(str: string): ParsedQrPrefix {
  if (str.length < 77) fail('INVALID_QR_PREFIX', 'Left QR must contain at least the fixed 77-character prefix.');
  const parts = invoiceParts(str.slice(0, 10));
  const rocDate = str.slice(10, 17);
  if (!/^\d{7}$/.test(rocDate)) fail('INVALID_DATE', 'QR date must contain seven ROC date digits.');
  const date = isoDate(Number(rocDate.slice(0, 3)) + 1911, Number(rocDate.slice(3, 5)), Number(rocDate.slice(5)));
  dateParts(date);
  const rawRandom = str.slice(17, 21);
  const buyerIdentifier = businessNumber(str.slice(37, 45), true);
  if (!/^\d{4}$/.test(rawRandom) && !(buyerIdentifier !== null && rawRandom === '    ')) {
    fail('INVALID_RANDOM_CODE', 'QR random code must contain four digits, or four spaces for a business buyer.');
  }
  const sales = hexAmount(str.slice(21, 29));
  const totalAmount = hexAmount(str.slice(29, 37));
  const sellerIdentifier = businessNumber(str.slice(45, 53), false)!;
  const encryption = str.slice(53, 77);
  validateEncryption(encryption);
  validateTotals(sales, totalAmount);
  return {
    ...parts, date, rocDate, randomCode: rawRandom === '    ' ? null : rawRandom,
    salesAmount: sales === 0 ? null : sales, salesAmountSeparated: sales !== 0,
    totalAmount, buyerIdentifier, sellerIdentifier, encryption,
  };
}

function count(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    fail('INVALID_ITEM_COUNT', 'Item counts must be nonnegative safe decimal integers.');
  }
  return Number(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return fail('INVALID_BASE64', 'Base64 item data must decode to valid UTF-8.'); }
}

function decimal(value: string, field: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)
      || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER) {
    fail('INVALID_ITEM', `Item ${field} must be a finite decimal number within the safe numeric range.`);
  }
  return Number(value);
}

function overseasAmount(value: string): number {
  if (!/^[0-9a-fA-F]{10}$/.test(value) || Number.parseInt(value.slice(8), 16) > 99) {
    fail('INVALID_OVERSEAS_AMOUNT', 'Overseas amount requires eight hex integer digits and two hex fractional digits (00–63).');
  }
  return Number.parseInt(value.slice(0, 8), 16) + Number.parseInt(value.slice(8), 16) / 100;
}

function readItems(raw: string, itemCount: number, encoding: EncodingParameter, complete: boolean) {
  // The official example encodes the WHOLE post-encoding payload, including colons.
  // Some scanners/issuers supply individual Base64 names; accept those as well.
  const nameOnlyBase64 = encoding === 2 && raw.includes(':');
  if (encoding === 2 && !complete && !nameOnlyBase64) {
    // Without a raw colon, a fragment could be an encoded name or the whole stream.
    return { items: [], isComplete: raw === '' && itemCount === 0, pendingItemData: raw, supplementalNotes: null, overseasAmounts: null };
  }
  const decoded = encoding === 2 && !nameOnlyBase64 ? decodeUtf8(base64Bytes(raw, 'INVALID_BASE64')) : raw;
  const fields = decoded === '' ? [] : decoded.split(':');
  let offset = 0;
  let overseasAmounts: OverseasAmounts | null = null;
  if (encoding === 3) {
    if (fields.length < 2 || fields[1] === '') {
      if (complete) fail('INVALID_OVERSEAS_AMOUNT', 'Overseas QR requires both extended amount fields.');
      return { items: [], isComplete: false, pendingItemData: decoded, supplementalNotes: null, overseasAmounts };
    }
    const salesAmountHex = fields[0]!;
    const totalAmountHex = fields[1]!;
    // A right QR may continue in the middle of either amount.
    if (!complete && fields.length === 2 && totalAmountHex.length < 10 && /^[0-9a-fA-F]*$/.test(totalAmountHex)) {
      return { items: [], isComplete: false, pendingItemData: decoded, supplementalNotes: null, overseasAmounts };
    }
    if (salesAmountHex !== '0000000000') fail('INVALID_OVERSEAS_AMOUNT', 'Overseas sales amount must be 0000000000.');
    overseasAmounts = { salesAmount: null, totalAmount: overseasAmount(totalAmountHex), salesAmountHex, totalAmountHex };
    offset = 2;
  }
  const items: InvoiceItem[] = [];
  while (items.length < itemCount && fields.length - offset >= 3) {
    let name = fields[offset]!;
    const quantityText = fields[offset + 1]!;
    const priceText = fields[offset + 2]!;
    if (!complete && fields.length === offset + 3 && /^(?:[+-]?\.?|[+-]?\d+\.)$/.test(priceText)) break;
    if (name === '') fail('INVALID_ITEM', 'Item name cannot be empty.');
    if (nameOnlyBase64) name = decodeUtf8(base64Bytes(name, 'INVALID_BASE64'));
    if (name === '') fail('INVALID_ITEM', 'Decoded item name cannot be empty.');
    items.push({ name, quantity: decimal(quantityText, 'quantity'), unitPrice: decimal(priceText, 'unitPrice') });
    offset += 3;
  }
  const isComplete = items.length === itemCount;
  if (complete && !isComplete) fail('INCOMPLETE_ITEMS', `Expected ${itemCount} complete QR items, received ${items.length}.`);
  const remainder = fields.slice(offset).join(':');
  return {
    items, isComplete, pendingItemData: isComplete ? '' : remainder,
    supplementalNotes: isComplete && remainder !== '' ? remainder : null,
    overseasAmounts,
  };
}

function parseQr(left: string, continuation: string, complete: boolean): ParsedLeftQr {
  requireString(left, 'left QR');
  const prefix = parsePrefix(left);
  const suffix = left.slice(77) + continuation;
  const header = /^:([^:]*):([^:]*):([^:]*):([^:]*)(?::([\s\S]*))?$/.exec(suffix);
  if (!header) fail('INVALID_QR_METADATA', 'Left QR requires merchant, item count, total count, and encoding fields.');
  const businessUse = header[1]!;
  if (businessUse.length !== 10) fail('INVALID_QR_METADATA', 'Merchant-use field must contain exactly ten characters.');
  const itemCount = count(header[2]);
  const totalItemCount = count(header[3]);
  if (itemCount > totalItemCount) fail('INVALID_ITEM_COUNT', 'QR item count cannot exceed total invoice item count.');
  const encodingText = header[4]!;
  if (!/^[0-3]$/.test(encodingText)) fail('INVALID_ENCODING', 'Encoding parameter must be 0, 1, 2, or 3.');
  const encodingParameter = Number(encodingText) as EncodingParameter;
  const encodings: QrEncoding[] = ['Big5', 'UTF-8', 'Base64', 'UTF-8-overseas'];
  // Literal concatenation is essential: splits can occur inside any item field.
  const itemData = header[5] ?? '';
  const content = readItems(itemData, itemCount, encodingParameter, complete);
  if (encodingParameter === 3) {
    if (prefix.salesAmount !== null || prefix.totalAmount !== 0) {
      fail('INVALID_OVERSEAS_AMOUNT', 'Overseas QR must use zero amounts in the fixed prefix.');
    }
    if (prefix.buyerIdentifier !== null) fail('INVALID_BUSINESS_NUMBER', 'Overseas e-commerce QR is for natural-person consumers.');
  } else {
    if (prefix.buyerIdentifier !== null && !prefix.salesAmountSeparated) {
      fail('INVALID_AMOUNT', 'Domestic business-buyer invoices must separately state sales amount.');
    }
    if (prefix.totalAmount === 0) fail('INVALID_AMOUNT', 'Domestic invoices must have a positive total amount.');
  }
  return {
    ...prefix, variant: encodingParameter === 3 ? 'overseas' : 'domestic',
    businessUse: businessUse === '**********' ? null : businessUse,
    itemCount, totalItemCount, encodingParameter, encoding: encodings[encodingParameter]!,
    itemData, ...content, prefixTotalAmount: prefix.totalAmount,
    totalAmount: content.overseasAmounts?.totalAmount ?? prefix.totalAmount,
  };
}

/** Parse left QR metadata and all currently available items.
 * Missing item data is returned with isComplete=false; use parseInvoiceQr to
 * require completeness or to combine a continuation before decoding Base64.
 */
export function parseLeftQr(str: string): ParsedLeftQr { return parseQr(str, '', false); }

/** Strip the required ** right-QR marker and preserve the continuation verbatim. */
export function parseRightQr(str: string): ParsedRightQr {
  requireString(str, 'right QR');
  if (!str.startsWith('**')) fail('INVALID_RIGHT_QR', 'Right QR must begin with **.');
  return { itemData: str.slice(2) };
}

/** Return cross-field discrepancies against a parsed or raw barcode, without throwing.
 * Malformed inputs, including parsed barcode fields, return structured issues.
 */
export function validateInvoice(invoice: ParsedLeftQr, barcode: string | ParsedBarcode): ValidationIssue[] {
  const result = safe(() => {
    if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice)) fail('INVALID_INPUT', 'Expected a parsed invoice.');
    requireString(invoice.date, 'invoice date');
    invoiceParts(invoice.invoiceNumber);
    if (invoice.randomCode !== null && (typeof invoice.randomCode !== 'string' || !/^\d{4}$/.test(invoice.randomCode))) {
      fail('INVALID_RANDOM_CODE', 'QR random code must be null or four digits.');
    }

    let parsed: ParsedBarcode;
    if (typeof barcode === 'string') parsed = parseBarcode(barcode);
    else {
      if (!barcode || typeof barcode !== 'object' || Array.isArray(barcode)) fail('INVALID_INPUT', 'Expected a barcode string or parsed barcode.');
      if (!barcode.period || typeof barcode.period !== 'object' || Array.isArray(barcode.period)) {
        fail('INVALID_PERIOD', 'Parsed barcode must contain an invoice period object.');
      }
      const parts = invoiceParts(barcode.invoiceNumber);
      if (barcode.track !== parts.track || barcode.number !== parts.number) {
        fail('INVALID_BARCODE', 'Parsed barcode track and number must match its invoice number.');
      }
      if (typeof barcode.randomCode !== 'string' || !/^\d{4}$/.test(barcode.randomCode)) {
        fail('INVALID_RANDOM_CODE', 'Barcode random code must contain four digits.');
      }
      parsed = barcode;
    }
    const errors: ValidationIssue[] = [];
    if (!isPeriodMatch(invoice.date, parsed.period)) errors.push({ code: 'PERIOD_MISMATCH', message: 'QR date does not belong to the barcode period.' });
    if (invoice.invoiceNumber !== parsed.invoiceNumber) errors.push({ code: 'INVOICE_NUMBER_MISMATCH', message: 'QR and barcode invoice numbers differ.' });
    if (invoice.randomCode !== null && invoice.randomCode !== parsed.randomCode) errors.push({ code: 'RANDOM_CODE_MISMATCH', message: 'QR and barcode random codes differ.' });
    return errors;
  });
  return result.success ? result.data : result.errors;
}

/** Combine both raw QR payloads before parsing; require every declared QR item.
 * options.barcode additionally checks period, invoice number, and random code.
 */
export function parseInvoiceQr(left: string, right?: string, options: ParseInvoiceOptions = {}): ParsedInvoiceQr {
  const result = parseQr(left, right === undefined ? '' : parseRightQr(right).itemData, true);
  if (options.barcode !== undefined) {
    const errors = validateInvoice(result, options.barcode);
    if (errors.length) throw new InvoiceParseError(errors[0]!.code, errors[0]!.message, errors);
  }
  return { ...result, isComplete: true };
}

/** Nonthrowing parseBarcode; validation failures use { code, message } entries. */
export function safeParseBarcode(str: string): SafeParseResult<ParsedBarcode> { return safe(() => parseBarcode(str)); }
/** Nonthrowing parseLeftQr, retaining the same partial-item behavior. */
export function safeParseLeftQr(str: string): SafeParseResult<ParsedLeftQr> { return safe(() => parseLeftQr(str)); }
/** Nonthrowing parseRightQr. */
export function safeParseRightQr(str: string): SafeParseResult<ParsedRightQr> { return safe(() => parseRightQr(str)); }
/** Nonthrowing parseInvoiceQr, including optional barcode cross-checks. */
export function safeParseInvoiceQr(left: string, right?: string, options: ParseInvoiceOptions = {}): SafeParseResult<ParsedInvoiceQr> {
  return safe(() => parseInvoiceQr(left, right, options));
}
