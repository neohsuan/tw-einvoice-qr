/** Stable, machine-readable validation codes. */
export type InvoiceErrorCode =
  | 'INVALID_INPUT' | 'INVALID_BARCODE' | 'INVALID_PERIOD' | 'INVALID_INVOICE_NUMBER'
  | 'INVALID_DATE' | 'INVALID_RANDOM_CODE' | 'INVALID_AMOUNT' | 'TOTAL_BELOW_SALES'
  | 'INVALID_BUSINESS_NUMBER' | 'INVALID_ENCRYPTION' | 'INVALID_QR_PREFIX'
  | 'INVALID_QR_METADATA' | 'INVALID_ITEM_COUNT' | 'INVALID_ENCODING'
  | 'INVALID_BASE64' | 'INVALID_ITEM' | 'INCOMPLETE_ITEMS' | 'INVALID_RIGHT_QR'
  | 'INVALID_OVERSEAS_AMOUNT' | 'PERIOD_MISMATCH' | 'INVOICE_NUMBER_MISMATCH'
  | 'RANDOM_CODE_MISMATCH' | 'INVALID_WINNING_NUMBER';

/** A validation failure; messages are explanatory English text. */
export interface ValidationIssue { code: InvoiceErrorCode; message: string }

/** Nonthrowing parse result, narrowed by `success`. */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationIssue[] };

/** Two-month invoice period. The period code uses endMonth, always even. */
export interface InvoicePeriod { rocYear: number; year: number; startMonth: number; endMonth: number }

/** ISO calendar date (YYYY-MM-DD), or a Date interpreted using its UTC date. */
export type DateInput = string | Date;

/** Parsed 19-character Code 39 payload (without start/stop asterisks). */
export interface ParsedBarcode {
  period: InvoicePeriod;
  invoiceNumber: string;
  track: string;
  number: string;
  randomCode: string;
}

/** A parsed period, five-digit ROC period code, or 19-character barcode. */
export type PeriodInput = InvoicePeriod | string;

/** Inclusive, nominal calendar claim window; no holiday extensions are applied. */
export interface ClaimPeriod { startDate: string; endDate: string }

/** QR encoding parameter, including the overseas e-commerce variant (3). */
export type EncodingParameter = 0 | 1 | 2 | 3;
/** Big5 scanner strings are already decoded and are preserved unchanged. */
export type QrEncoding = 'Big5' | 'UTF-8' | 'Base64' | 'UTF-8-overseas';

/** One decoded item; decimal quantities and signed decimal prices are supported. */
export interface InvoiceItem { name: string; quantity: number; unitPrice: number }

/** Decoded fixed 77-character prefix. */
export interface ParsedQrPrefix {
  invoiceNumber: string;
  track: string;
  number: string;
  date: string;
  rocDate: string;
  /** Null for the four-space B2B random-code representation. */
  randomCode: string | null;
  /** Null when the fixed sales field is 00000000. */
  salesAmount: number | null;
  salesAmountSeparated: boolean;
  totalAmount: number;
  /** Null for the general-consumer sentinel 00000000. */
  buyerIdentifier: string | null;
  sellerIdentifier: string;
  /** Base64 AES ciphertext, kept verbatim; this library does not authenticate it. */
  encryption: string;
}

/** Overseas amounts use eight hex integer digits and two hex fractional digits. */
export interface OverseasAmounts {
  salesAmount: null;
  totalAmount: number;
  salesAmountHex: string;
  totalAmountHex: string;
}

/** Left QR data, possibly incomplete until the right QR is supplied. */
export interface ParsedLeftQr extends ParsedQrPrefix {
  variant: 'domestic' | 'overseas';
  /** Unused merchant field (**********) becomes null. */
  businessUse: string | null;
  itemCount: number;
  totalItemCount: number;
  encodingParameter: EncodingParameter;
  encoding: QrEncoding;
  items: InvoiceItem[];
  /** True when all declared QR items and overseas amount fields are available. */
  isComplete: boolean;
  /** Raw post-encoding payload; may be a fragment of a Base64 stream. */
  itemData: string;
  /** Unparsed remainder; ambiguous encoding-2 fragments stay raw until combined. */
  pendingItemData: string;
  /** Extra data after the declared item triplets, with colons preserved. */
  supplementalNotes: string | null;
  /** Fixed prefix total; totalAmount holds the extended total for overseas QR. */
  prefixTotalAmount: number;
  overseasAmounts: OverseasAmounts | null;
}

/** Right QR content without its ** marker; standalone items need left metadata. */
export interface ParsedRightQr { itemData: string }

/** Combined QR result, requiring every item declared by itemCount. */
export interface ParsedInvoiceQr extends ParsedLeftQr { isComplete: true }

/** Optional cross-check against a Code 39 barcode. */
export interface ParseInvoiceOptions { barcode?: string | ParsedBarcode }

/** Fixture generator inputs; amounts must fit an unsigned 32-bit integer. */
export interface LeftQrPrefixFields {
  invoiceNumber: string;
  date: string;
  randomCode: string | null;
  salesAmount: number | null;
  totalAmount: number;
  buyerIdentifier: string | null;
  sellerIdentifier: string;
  encryption: string;
}

/** Winning numbers must retain their leading zeroes. */
export interface WinningNumbers {
  special?: string;
  grand?: string;
  first: string[];
  additionalSixth?: string[];
}

/** The single highest matching lottery tier. */
export type Prize = 'special' | 'grand' | 'first' | 'second' | 'third' | 'fourth'
  | 'fifth' | 'sixth' | 'additionalSixth' | 'none';

/** matched is the winning number (full first-prize number for suffix matches). */
export interface PrizeResult { prize: Prize; nameZh: string; amount: number; matched: string | null }
