import { describe, expect, it } from 'vitest';
import {
  buildLeftQrPrefix, InvoiceParseError, isValidBusinessNumber, parseBarcode, parseInvoiceQr,
  parseLeftQr, parseRightQr, safeParseInvoiceQr, safeParseLeftQr, safeParseRightQr,
  validateInvoice,
} from '../src/index.js';
import type { ParsedBarcode, ParsedLeftQr } from '../src/index.js';
import { base64, expectedItems, fields, items, prefix, replaceField } from './fixtures.js';

describe('fixed prefix and validation', () => {
  it('round trips every fixed field in the exact 77-character prefix', () => {
    expect(prefix).toHaveLength(77);
    expect(prefix.slice(10, 17)).toBe('1150831');
    expect(prefix.slice(21, 37)).toBe('0000014400000154');
    expect(parseLeftQr(`${prefix}:**********:0:3:1`)).toMatchObject({
      ...fields, track: 'AB', number: '11223344', rocDate: '1150831',
      salesAmountSeparated: true, businessUse: null, items: [], isComplete: true,
      encoding: 'UTF-8', encodingParameter: 1, variant: 'domestic',
    });
  });
  it('represents consumer and unavailable sales as null', () => {
    const left = buildLeftQrPrefix({ ...fields, salesAmount: null });
    expect(parseInvoiceQr(`${left}:**********:0:1:0`)).toMatchObject({
      buyerIdentifier: null, salesAmount: null, salesAmountSeparated: false, totalAmount: 340,
    });
    expect(buildLeftQrPrefix({ ...fields, salesAmount: 0 })).toBe(left);
  });
  it('accepts lower-case hex, unsigned 32-bit amounts, and preserves cipher text', () => {
    const value = buildLeftQrPrefix({ ...fields, salesAmount: 0xffffffff, totalAmount: 0xffffffff });
    const lowercaseHex = replaceField(value, 21, 16, 'ffffffffffffffff');
    expect(parseInvoiceQr(`${lowercaseHex}:**********:0:1:1`).totalAmount).toBe(0xffffffff);
    expect(parseInvoiceQr(`${prefix}:**********:0:1:0`).encryption).toBe(fields.encryption);
  });
  it('supports four-space B2B random code and validates separately stated sales', () => {
    const value = buildLeftQrPrefix({ ...fields, buyerIdentifier: '10458570', randomCode: null });
    expect(value.slice(17, 21)).toBe('    ');
    expect(parseInvoiceQr(`${value}:**********:0:1:1`)).toMatchObject({ randomCode: null, buyerIdentifier: '10458570' });
    expect(safeParseLeftQr(`${replaceField(value, 21, 8, '00000000')}:**********:0:1:1`))
      .toMatchObject({ success: false, errors: [{ code: 'INVALID_AMOUNT' }] });
  });
  it.each([
    [10, 7, '1150230', 'INVALID_DATE'], [10, 7, '0000101', 'INVALID_DATE'],
    [10, 7, '1150x01', 'INVALID_DATE'], [17, 4, '    ', 'INVALID_RANDOM_CODE'],
    [17, 4, '99x9', 'INVALID_RANDOM_CODE'], [21, 8, '00000x44', 'INVALID_AMOUNT'],
    [29, 8, '00000100', 'TOTAL_BELOW_SALES'], [37, 8, '12345678', 'INVALID_BUSINESS_NUMBER'],
    [45, 8, '00000000', 'INVALID_BUSINESS_NUMBER'], [45, 8, '12345678', 'INVALID_BUSINESS_NUMBER'],
    [53, 24, '!!!!!!!!!!!!!!!!!!!!!!!!', 'INVALID_ENCRYPTION'],
    [53, 24, 'ydXZt4LAN1UHN/j1juVcRB==', 'INVALID_ENCRYPTION'],
  ] as const)('rejects corrupt prefix at %i (%s)', (start, length, replacement, code) => {
    expect(safeParseLeftQr(`${replaceField(prefix, start, length, replacement)}:**********:0:1:1`))
      .toMatchObject({ success: false, errors: [{ code }] });
  });
  it('rejects short prefixes, zero domestic total, and invalid JS types', () => {
    expect(safeParseLeftQr('AB123')).toMatchObject({ success: false, errors: [{ code: 'INVALID_QR_PREFIX' }] });
    const zero = buildLeftQrPrefix({ ...fields, salesAmount: null, totalAmount: 0 });
    expect(() => parseInvoiceQr(`${zero}:**********:0:0:1`)).toThrow(InvoiceParseError);
    expect(safeParseLeftQr(42 as unknown as string)).toMatchObject({ success: false, errors: [{ code: 'INVALID_INPUT' }] });
  });
});

describe('2023 business-number checksum', () => {
  it.each(['04595252', '10458570', '24536806', '00000079', '00000074', '00000108'])(
    'accepts compatible checksum %s', (value) => expect(isValidBusinessNumber(value)).toBe(true),
  );
  it('accepts the official new-rule examples which old divisor-10 checks reject', () => {
    expect(isValidBusinessNumber('04595252')).toBe(true);
    expect(isValidBusinessNumber('10458570')).toBe(true);
  });
  it.each(['00000000', '12345678', '00000078', '0459525', '045952521', '１２３４５６７８', ' 04595252'])(
    'rejects invalid checksum or syntax %s', (value) => expect(isValidBusinessNumber(value)).toBe(false),
  );
});

describe('metadata and items', () => {
  it.each([0, 1])('parses official-layout items with encoding %i', (encoding) => {
    expect(parseInvoiceQr(`${prefix}:**********:3:3:${encoding}:乾電池:1:105:`, '**口罩:1:210:牛奶:1:25'))
      .toMatchObject({ items: expectedItems, isComplete: true, encoding: encoding === 0 ? 'Big5' : 'UTF-8' });
  });
  it('keeps decoded Big5 names, spaces, emoji, and literal merchant data', () => {
    expect(parseInvoiceQr(`${prefix}:0123456789:1:3:0: 牛奶 🥛 :1.5:25.50`)).toMatchObject({
      businessUse: '0123456789', items: [{ name: ' 牛奶 🥛 ', quantity: 1.5, unitPrice: 25.5 }], totalItemCount: 3,
    });
  });
  it('parses signed prices and fractional quantities without scientific notation', () => {
    expect(parseInvoiceQr(`${prefix}:**********:2:2:1:折讓:1:-10:秤重:.5:+100.25`).items).toEqual([
      { name: '折讓', quantity: 1, unitPrice: -10 }, { name: '秤重', quantity: 0.5, unitPrice: 100.25 },
    ]);
  });
  it('only consumes declared triplets and preserves supplemental fields verbatim', () => {
    const result = parseInvoiceQr(`${prefix}:**********:1:1:1:牛奶:1:25:會員:123:備註:\n謝謝`);
    expect(result.items).toHaveLength(1);
    expect(result.supplementalNotes).toBe('會員:123:備註:\n謝謝');
    expect(parseInvoiceQr(`${prefix}:**********:0:1:1:備註:其他`).supplementalNotes).toBe('備註:其他');
  });
  it('reports incomplete left data but requires declared items in combined parsing', () => {
    const left = `${prefix}:**********:3:3:1:乾電池:1:105:口罩:1`;
    expect(parseLeftQr(left)).toMatchObject({ items: expectedItems.slice(0, 1), isComplete: false, pendingItemData: '口罩:1' });
    expect(safeParseInvoiceQr(left)).toMatchObject({ success: false, errors: [{ code: 'INCOMPLETE_ITEMS' }] });
    expect(parseInvoiceQr(left, '**:210:牛奶:1:25').items).toEqual(expectedItems);
  });
  it('concatenates at every possible character boundary without inserting separators', () => {
    for (let i = 0; i <= items.length; i++) {
      const left = `${prefix}:**********:3:3:1:${items.slice(0, i)}`;
      expect(parseInvoiceQr(left, `**${items.slice(i)}`).items).toEqual(expectedItems);
    }
    expect(parseInvoiceQr(`${prefix}:**********:3:3:1`, `**:${items}`).items).toEqual(expectedItems);
  });
  it('recomputes a split price even when left alone looks complete', () => {
    const left = `${prefix}:**********:1:1:1:牛奶:1:2`;
    expect(parseLeftQr(left).items[0]?.unitPrice).toBe(2);
    expect(parseInvoiceQr(left, '**5').items[0]?.unitPrice).toBe(25);
    expect(parseLeftQr(`${left}.`).isComplete).toBe(false);
    expect(parseInvoiceQr(`${left}.`, '**5').items[0]?.unitPrice).toBe(2.5);
  });
  it.each([['.', 0.5], ['+.', 0.5], ['-.', -0.5]] as const)(
    'keeps a split fractional price %s pending until the right QR arrives', (price, unitPrice) => {
      const left = `${prefix}:**********:1:1:1:秤重:1:${price}`;
      expect(parseLeftQr(left)).toMatchObject({ items: [], isComplete: false, pendingItemData: `秤重:1:${price}` });
      expect(parseInvoiceQr(left, '**5').items).toEqual([{ name: '秤重', quantity: 1, unitPrice }]);
      expect(safeParseInvoiceQr(left)).toMatchObject({ success: false, errors: [{ code: 'INVALID_ITEM' }] });
    },
  );
  it.each([
    ['', 'INVALID_QR_METADATA'], [':short:0:1:1', 'INVALID_QR_METADATA'],
    [':**********:-1:1:1', 'INVALID_ITEM_COUNT'], [':**********:2:1:1', 'INVALID_ITEM_COUNT'],
    [':**********:9007199254740992:9007199254740992:1', 'INVALID_ITEM_COUNT'],
    [':**********:0:1:4', 'INVALID_ENCODING'], [':**********:0:1:01', 'INVALID_ENCODING'],
    [':**********:1:1:1::1:25', 'INVALID_ITEM'], [':**********:1:1:1:牛奶:NaN:25', 'INVALID_ITEM'],
    [':**********:1:1:1:牛奶:1:Infinity', 'INVALID_ITEM'], [':**********:1:1:1:牛奶:1:1e3', 'INVALID_ITEM'],
    [':**********:1:1:1:牛奶:1:9007199254740992', 'INVALID_ITEM'],
    [':**********:1:1:1:牛奶:1:', 'INVALID_ITEM'],
  ])('returns structured metadata/item errors for %s', (suffix, code) => {
    const result = safeParseInvoiceQr(`${prefix}${suffix}`);
    expect(result).toMatchObject({ success: false, errors: [{ code }] });
  });
  it('validates the right marker and keeps raw continuation text', () => {
    expect(parseRightQr('**')).toEqual({ itemData: '' });
    expect(parseRightQr('**:牛奶:1:25')).toEqual({ itemData: ':牛奶:1:25' });
    expect(safeParseRightQr('牛奶:1:25')).toMatchObject({ success: false, errors: [{ code: 'INVALID_RIGHT_QR' }] });
    expect(() => parseInvoiceQr(`${prefix}:**********:0:1:1`, '*')).toThrow(InvoiceParseError);
  });
});

describe('Base64', () => {
  const payload = base64(items);
  it('decodes the official whole-payload Base64 example after combining both QR codes', () => {
    const left = `${prefix}:**********:3:3:2:5Lm+6Zu75rGg`;
    const right = '**OjE6MTA1OuWPo+e9qToxOjIxMDrniZvlpbY6MToyNQ==';
    expect(parseLeftQr(left).isComplete).toBe(false);
    expect(parseInvoiceQr(left, right).items).toEqual(expectedItems);
  });
  it('handles every encoded split including quartets, padding, and UTF-8 byte boundaries', () => {
    for (let split = 0; split <= payload.length; split++) {
      expect(parseInvoiceQr(`${prefix}:**********:3:3:2:${payload.slice(0, split)}`, `**${payload.slice(split)}`).items).toEqual(expectedItems);
    }
  });
  it('accepts every valid left fragment, including one half of the padding pair', () => {
    for (let split = 0; split <= payload.length; split++) {
      expect(safeParseLeftQr(`${prefix}:**********:3:3:2:${payload.slice(0, split)}`).success).toBe(true);
    }
    const left = `${prefix}:**********:3:3:2:${payload.slice(0, -1)}`;
    expect(parseLeftQr(left).isComplete).toBe(false);
    expect(parseInvoiceQr(left, '**=').items).toEqual(expectedItems);
  });
  it.each(['whole-payload', 'name-only'] as const)(
    'keeps ambiguous left data raw and combines every %s Base64 split', (style) => {
      const names = ['牛奶🥛', '口罩'];
      const raw = style === 'whole-payload'
        ? base64(`${names[0]}:1:.5:${names[1]}:2:-10.25`)
        : `${base64(names[0]!)}:1:.5:${base64(names[1]!)}:2:-10.25`;
      for (let split = 0; split <= raw.length; split++) {
        const fragment = raw.slice(0, split);
        const left = `${prefix}:**********:2:2:2:${fragment}`;
        const partial = parseLeftQr(left);
        if (!fragment.includes(':')) {
          expect(partial).toMatchObject({ items: [], isComplete: false, itemData: fragment, pendingItemData: fragment });
        }
        expect(parseInvoiceQr(left, `**${raw.slice(split)}`).items).toEqual([
          { name: names[0], quantity: 1, unitPrice: 0.5 },
          { name: names[1], quantity: 2, unitPrice: -10.25 },
        ]);
      }
    },
  );
  it('supports independently Base64-encoded item names for scanner compatibility', () => {
    expect(parseInvoiceQr(`${prefix}:**********:2:2:2:${base64('牛奶🥛')}:1:25:${base64('口罩')}:2:10`).items)
      .toEqual([{ name: '牛奶🥛', quantity: 1, unitPrice: 25 }, { name: '口罩', quantity: 2, unitPrice: 10 }]);
  });
  it('preserves whole-payload supplemental notes', () => {
    expect(parseInvoiceQr(`${prefix}:**********:3:3:2:${base64(`${items}:備註:123`)}`).supplementalNotes).toBe('備註:123');
  });
  it.each(['!!!!', 'YQ', 'YQ===', 'YR==', '_w==', '/w==', ' YQ==', 'YQ==\n'])(
    'rejects malformed Base64 or UTF-8 %j', (payload) => {
      expect(safeParseInvoiceQr(`${prefix}:**********:1:1:2:${payload}`)).toMatchObject({ success: false, errors: [{ code: 'INVALID_BASE64' }] });
    },
  );
  it('works with Buffer unavailable in the runtime', () => {
    const saved = globalThis.Buffer;
    try {
      Object.defineProperty(globalThis, 'Buffer', { value: undefined, configurable: true, writable: true });
      expect(parseInvoiceQr(`${prefix}:**********:3:3:2:${payload}`).items).toEqual(expectedItems);
    } finally { globalThis.Buffer = saved; }
  });
});

describe('overseas e-commerce encoding 3', () => {
  const overseasPrefix = buildLeftQrPrefix({ ...fields, salesAmount: null, totalAmount: 0 });
  const amounts = '0000000000:0000016B63';
  it('interprets integer and fractional hex separately, including 363.99', () => {
    expect(parseInvoiceQr(`${overseasPrefix}:**********:1:1:3:${amounts}:訂閱:1:363.99`)).toMatchObject({
      variant: 'overseas', encoding: 'UTF-8-overseas', salesAmount: null, totalAmount: 363.99,
      prefixTotalAmount: 0, overseasAmounts: { salesAmount: null, totalAmount: 363.99, totalAmountHex: '0000016B63' },
      items: [{ name: '訂閱', quantity: 1, unitPrice: 363.99 }],
    });
  });
  it('combines extended amount fields across QR boundaries', () => {
    const payload = `${amounts}:訂閱:1:363.99`;
    for (let i = 0; i < payload.length; i++) {
      expect(parseInvoiceQr(`${overseasPrefix}:**********:1:1:3:${payload.slice(0, i)}`, `**${payload.slice(i)}`).totalAmount).toBe(363.99);
    }
    expect(parseLeftQr(`${overseasPrefix}:**********:1:1:3:0000000000:0000`).isComplete).toBe(false);
  });
  it.each(['0000000000:0000016B64', '0000000001:0000016B63', '0000000000:0000016Bx0', '0000000000'])(
    'rejects invalid extended amounts %s', (value) => {
      expect(safeParseInvoiceQr(`${overseasPrefix}:**********:0:1:3:${value}`)).toMatchObject({ success: false, errors: [{ code: 'INVALID_OVERSEAS_AMOUNT' }] });
    },
  );
  it('requires the overseas zero-prefix representation', () => {
    expect(safeParseInvoiceQr(`${prefix}:**********:0:1:3:${amounts}`))
      .toMatchObject({ success: false, errors: [{ code: 'INVALID_OVERSEAS_AMOUNT' }] });
  });
  it('rejects a business buyer because overseas e-commerce invoices are for domestic natural persons', () => {
    const businessBuyerPrefix = buildLeftQrPrefix({ ...fields, salesAmount: null, totalAmount: 0, buyerIdentifier: '10458570' });
    const left = `${businessBuyerPrefix}:**********:1:1:3:${amounts}:訂閱:1:363.99`;
    // Spec §貳.三.(一).13 limits this variant to sales to domestic natural persons.
    expect(safeParseLeftQr(left)).toMatchObject({ success: false, errors: [{ code: 'INVALID_BUSINESS_NUMBER' }] });
    expect(safeParseInvoiceQr(left)).toMatchObject({ success: false, errors: [{ code: 'INVALID_BUSINESS_NUMBER' }] });
  });
});

describe('barcode cross-check', () => {
  const left = `${prefix}:**********:0:1:1`;
  it('validates period, invoice number, and random code', () => {
    expect(parseInvoiceQr(left, undefined, { barcode: '11508AB112233449999' }).date).toBe('2026-08-31');
    expect(validateInvoice(parseLeftQr(left), '11508AB112233449999')).toEqual([]);
    expect(safeParseInvoiceQr(left, undefined, { barcode: '11510ZZ112233440000' })).toMatchObject({
      success: false, errors: [
        { code: 'PERIOD_MISMATCH' }, { code: 'INVOICE_NUMBER_MISMATCH' }, { code: 'RANDOM_CODE_MISMATCH' },
      ],
    });
  });
  it('reports malformed barcode errors through both validation paths', () => {
    expect(validateInvoice(parseLeftQr(left), 'bad')).toMatchObject([{ code: 'INVALID_BARCODE' }]);
    expect(safeParseInvoiceQr(left, undefined, { barcode: 'bad' })).toMatchObject({ success: false, errors: [{ code: 'INVALID_BARCODE' }] });
  });
  it('accepts parsed barcodes in options and reports all discrepancies', () => {
    expect(parseInvoiceQr(left, undefined, { barcode: parseBarcode('11508AB112233449999') }).date).toBe('2026-08-31');
    const barcode = parseBarcode('11510ZZ112233440000');
    const errors = [{ code: 'PERIOD_MISMATCH' }, { code: 'INVOICE_NUMBER_MISMATCH' }, { code: 'RANDOM_CODE_MISMATCH' }];
    expect(validateInvoice(parseLeftQr(left), barcode)).toMatchObject(errors);
    expect(safeParseInvoiceQr(left, undefined, { barcode })).toMatchObject({ success: false, errors });
  });
  it.each([
    [null, 'INVALID_INPUT'], [undefined, 'INVALID_INPUT'], [42, 'INVALID_INPUT'],
    [true, 'INVALID_INPUT'], [[], 'INVALID_INPUT'], [{}, 'INVALID_PERIOD'],
    [{ ...parseBarcode('11508AB112233449999'), period: null }, 'INVALID_PERIOD'],
    [{ ...parseBarcode('11508AB112233449999'), period: '11508' }, 'INVALID_PERIOD'],
    [{ ...parseBarcode('11508AB112233449999'), period: { rocYear: 115, year: 2026, startMonth: 7, endMonth: 7 } }, 'INVALID_PERIOD'],
    [{ ...parseBarcode('11508AB112233449999'), invoiceNumber: null }, 'INVALID_INPUT'],
    [{ ...parseBarcode('11508AB112233449999'), invoiceNumber: 'bad' }, 'INVALID_INVOICE_NUMBER'],
    [{ ...parseBarcode('11508AB112233449999'), track: 'ZZ' }, 'INVALID_BARCODE'],
    [{ ...parseBarcode('11508AB112233449999'), number: '00000000' }, 'INVALID_BARCODE'],
    [{ ...parseBarcode('11508AB112233449999'), randomCode: null }, 'INVALID_RANDOM_CODE'],
    [{ ...parseBarcode('11508AB112233449999'), randomCode: 'bad' }, 'INVALID_RANDOM_CODE'],
  ])('returns issues for malformed parsed barcode %j', (input, code) => {
    const barcode = input as ParsedBarcode;
    expect(validateInvoice(parseLeftQr(left), barcode)).toMatchObject([{ code }]);
    expect(safeParseInvoiceQr(left, undefined, { barcode })).toMatchObject(
      input === undefined ? { success: true } : { success: false, errors: [{ code }] },
    );
  });
  it.each([
    [null, 'INVALID_INPUT'], [undefined, 'INVALID_INPUT'], [42, 'INVALID_INPUT'], [[], 'INVALID_INPUT'],
    [{}, 'INVALID_INPUT'], [{ ...parseLeftQr(left), date: null }, 'INVALID_INPUT'],
    [{ ...parseLeftQr(left), date: '2026-02-30' }, 'INVALID_DATE'],
    [{ ...parseLeftQr(left), invoiceNumber: 'bad' }, 'INVALID_INVOICE_NUMBER'],
    [{ ...parseLeftQr(left), randomCode: undefined }, 'INVALID_RANDOM_CODE'],
  ])('returns issues for invalid invoice input %j', (invoice, code) => {
    expect(validateInvoice(invoice as ParsedLeftQr, '11508AB112233449999')).toMatchObject([{ code }]);
  });
  it.each([null, '9999', '1234'])('cross-checks B2B random code %j against a numeric barcode', (randomCode) => {
    // Spec §貳.五.6 prescribes blanks; numeric B2B codes remain accepted for compatibility.
    const businessPrefix = buildLeftQrPrefix({ ...fields, buyerIdentifier: '10458570', randomCode });
    const invoice = parseLeftQr(`${businessPrefix}:**********:0:1:1`);
    expect(invoice.randomCode).toBe(randomCode);
    expect(businessPrefix.slice(17, 21)).toBe(randomCode ?? '    ');
    const errors = randomCode === '1234' ? [{ code: 'RANDOM_CODE_MISMATCH' }] : [];
    expect(validateInvoice(invoice, '11508AB112233449999')).toMatchObject(errors);
    expect(validateInvoice(invoice, parseBarcode('11508AB112233449999'))).toMatchObject(errors);
  });
  it('throws InvoiceParseError with all cross-check errors', () => {
    try { parseInvoiceQr(left, undefined, { barcode: '11510ZZ112233440000' }); }
    catch (error) {
      expect(error).toBeInstanceOf(InvoiceParseError);
      expect((error as InvoiceParseError).code).toBe('PERIOD_MISMATCH');
      expect((error as InvoiceParseError).errors).toHaveLength(3);
      return;
    }
    throw new Error('Expected a cross-check error');
  });
});

describe('prefix generator errors', () => {
  it.each([-1, 1.5, NaN, Infinity, 0x100000000])('rejects out-of-range amounts %s', (value) => {
    expect(() => buildLeftQrPrefix({ ...fields, totalAmount: value })).toThrow(InvoiceParseError);
  });
  it('validates fields before concatenation and accepts leap dates', () => {
    expect(() => buildLeftQrPrefix({ ...fields, invoiceNumber: 'ab11223344' })).toThrow(InvoiceParseError);
    expect(() => buildLeftQrPrefix({ ...fields, randomCode: '99999' })).toThrow(InvoiceParseError);
    expect(() => buildLeftQrPrefix({ ...fields, randomCode: null })).toThrow(InvoiceParseError);
    expect(() => buildLeftQrPrefix({ ...fields, date: '2026-02-29' })).toThrow(InvoiceParseError);
    expect(() => buildLeftQrPrefix({ ...fields, salesAmount: 400 })).toThrow(InvoiceParseError);
    const leap = buildLeftQrPrefix({ ...fields, date: '2024-02-29' });
    expect(parseInvoiceQr(`${leap}:**********:0:1:1`).date).toBe('2024-02-29');
  });
});
