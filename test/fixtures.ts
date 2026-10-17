import { buildLeftQrPrefix } from '../src/index.js';
import type { LeftQrPrefixFields } from '../src/index.js';

export const fields: LeftQrPrefixFields = {
  invoiceNumber: 'AB11223344', date: '2026-08-31', randomCode: '9999',
  salesAmount: 324, totalAmount: 340, buyerIdentifier: null,
  sellerIdentifier: '04595252', encryption: 'ydXZt4LAN1UHN/j1juVcRA==',
};

export const prefix = buildLeftQrPrefix(fields);
export const items = '乾電池:1:105:口罩:1:210:牛奶:1:25';
export const expectedItems = [
  { name: '乾電池', quantity: 1, unitPrice: 105 },
  { name: '口罩', quantity: 1, unitPrice: 210 },
  { name: '牛奶', quantity: 1, unitPrice: 25 },
];

export function base64(value: string): string {
  return btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(''));
}

export function replaceField(input: string, start: number, length: number, replacement: string): string {
  return input.slice(0, start) + replacement + input.slice(start + length);
}
