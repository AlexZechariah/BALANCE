import { describe, expect, it } from 'vitest';

import { extractionRetrySchema } from './index';

describe('extractionRetrySchema', () => {
  it('accepts v0.5 requestable extraction providers', () => {
    for (const provider of ['paddleocr', 'tesseract', 'manual', 'legacy_textract']) {
      expect(extractionRetrySchema.parse({ provider })).toEqual({ provider });
    }
  });

  it('rejects the old raw Textract provider name', () => {
    expect(() => extractionRetrySchema.parse({ provider: 'textract' })).toThrow();
  });
});
