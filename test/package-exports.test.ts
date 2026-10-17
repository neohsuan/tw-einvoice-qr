import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@hsuan741220/tw-einvoice-qr';

function run(source: string, mode: 'module' | 'commonjs'): { names: string[]; year: number; version: string } {
  const directory = mkdtempSync(join(tmpdir(), 'tw-einvoice-exports-'));
  const resultFile = join(directory, 'result.json');
  try {
    // A file keeps the probe independent of test-runner stdout capture.
    execFileSync(process.execPath, [`--input-type=${mode}`, '--eval', source], {
      cwd, stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '', TW_EINVOICE_EXPORT_RESULT: resultFile },
    });
    return JSON.parse(readFileSync(resultFile, 'utf8')) as { names: string[]; year: number; version: string };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('built package self-reference exports', () => {
  it('supports native ESM import and CJS require with exactly the same public names', () => {
    const esm = run(`
      import * as api from '${packageName}';
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      require('node:fs').writeFileSync(process.env.TW_EINVOICE_EXPORT_RESULT, JSON.stringify({
        names: Object.keys(api).sort(), year: api.parseBarcode('11508AB112233449999').period.year,
        version: require('${packageName}/package.json').version
      }));
    `, 'module');
    const cjs = run(`
      const api = require('${packageName}');
      require('node:fs').writeFileSync(process.env.TW_EINVOICE_EXPORT_RESULT, JSON.stringify({
        names: Object.keys(api).sort(), year: api.parseBarcode('11508AB112233449999').period.year,
        version: require('${packageName}/package.json').version
      }));
    `, 'commonjs');
    expect(cjs).toEqual(esm);
    expect(esm.year).toBe(2026);
    expect(esm.version).toBe('1.0.0');
    expect(esm.names).toEqual([
      'InvoiceParseError', 'buildLeftQrPrefix', 'checkPrize', 'getClaimPeriod', 'getDrawDate',
      'getPeriod', 'isPeriodMatch', 'isValidBusinessNumber', 'parseBarcode', 'parseInvoiceQr',
      'parseLeftQr', 'parseRightQr', 'safeParseBarcode', 'safeParseInvoiceQr',
      'safeParseLeftQr', 'safeParseRightQr', 'validateInvoice',
    ].sort());
  });
});
