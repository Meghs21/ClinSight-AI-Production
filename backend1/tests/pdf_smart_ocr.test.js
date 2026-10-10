'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { SmartOCRProvider } = require('../ocr/ocrProvider');

test('SmartOCRProvider scanned PDF (S01-S03) vs digital PDF (P01-P05) benchmark', async (t) => {
  const provider = new SmartOCRProvider();
  const baseDir = path.join(__dirname, '../evals/synthetic/images');

  // Test S01 - S03 (Scanned PDFs without embedded text layer)
  for (const name of ['S01.pdf', 'S02.pdf', 'S03.pdf']) {
    await t.test(`Scanned PDF ${name} should not output raw %PDF header and should flag review`, async () => {
      const filePath = path.join(baseDir, name);
      const res = await provider.processDocument(filePath);

      assert.ok(res, 'Response should exist');
      assert.ok(typeof res.text === 'string', 'res.text should be a string');
      assert.equal(
        res.text.startsWith('%PDF'),
        false,
        `Expected ${name} text NOT to start with raw '%PDF', got: ${res.text.slice(0, 30)}`
      );
      assert.ok(
        res.confidence <= 0.75,
        `Expected scanned unreadable/rendered PDF confidence to be <= 0.75 (so review gate fires), got ${res.confidence}`
      );
    });
  }

  // Test P01 - P05 (Digital native PDFs with embedded text layer)
  for (const name of ['P01.pdf', 'P02.pdf', 'P03.pdf', 'P04.pdf', 'P05.pdf']) {
    await t.test(`Digital native PDF ${name} should use fast path and extract text cleanly`, async () => {
      const filePath = path.join(baseDir, name);
      const res = await provider.processDocument(filePath);

      assert.ok(res, 'Response should exist');
      assert.equal(
        res.text.startsWith('%PDF'),
        false,
        `Expected ${name} text NOT to start with '%PDF', got: ${res.text.slice(0, 30)}`
      );
      assert.equal(res.path, 'pdf_digital_fastpath', `Expected fast path for digital PDF ${name}, got ${res.path}`);
      assert.equal(res.confidence, 1.0, `Expected 1.0 confidence for digital PDF ${name}`);
      assert.ok(res.text.includes('Patient'), `Expected patient text in ${name}`);
    });
  }
});
