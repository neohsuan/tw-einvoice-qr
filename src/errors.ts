import type { InvoiceErrorCode, SafeParseResult, ValidationIssue } from './types.js';

/** Error thrown by parsing and validation helpers for invalid input. */
export class InvoiceParseError extends Error {
  readonly code: InvoiceErrorCode;
  readonly errors: ValidationIssue[];

  constructor(code: InvoiceErrorCode, message: string, errors?: ValidationIssue[]) {
    super(message);
    this.name = 'InvoiceParseError';
    this.code = code;
    this.errors = errors ?? [{ code, message }];
  }
}

export function fail(code: InvoiceErrorCode, message: string): never {
  throw new InvoiceParseError(code, message);
}

export function safe<T>(parse: () => T): SafeParseResult<T> {
  try { return { success: true, data: parse() }; }
  catch (error) {
    if (error instanceof InvoiceParseError) return { success: false, errors: error.errors };
    throw error;
  }
}

export function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') fail('INVALID_INPUT', `${field} must be a string.`);
}
