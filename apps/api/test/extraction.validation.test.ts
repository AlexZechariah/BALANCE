import { describe, expect, it } from 'vitest';

import { resolveExtractionProvider } from '../src/extraction/extraction.validation';

describe('resolveExtractionProvider', () => {
  it('defaults to paddleocr for v0.5 local extraction', () => {
    expect(resolveExtractionProvider({ requestedProvider: null, defaultProvider: undefined, allowLegacyTextract: false })).toBe('paddleocr');
  });

  it('accepts active v0.5 providers', () => {
    for (const provider of ['paddleocr', 'tesseract', 'manual']) {
      expect(resolveExtractionProvider({ requestedProvider: provider, defaultProvider: 'paddleocr', allowLegacyTextract: false })).toBe(provider);
    }
  });

  it('disables legacy_textract unless explicitly allowed', () => {
    expect(() =>
      resolveExtractionProvider({ requestedProvider: 'legacy_textract', defaultProvider: 'paddleocr', allowLegacyTextract: false })
    ).toThrow('legacy_textract is disabled');

    expect(resolveExtractionProvider({ requestedProvider: 'legacy_textract', defaultProvider: 'paddleocr', allowLegacyTextract: true })).toBe(
      'legacy_textract'
    );
  });

  it('rejects unsupported and old raw Textract providers', () => {
    expect(() => resolveExtractionProvider({ requestedProvider: 'textract', defaultProvider: 'paddleocr', allowLegacyTextract: false })).toThrow(
      'Unsupported extraction provider'
    );
    expect(() => resolveExtractionProvider({ requestedProvider: 'made-up', defaultProvider: 'paddleocr', allowLegacyTextract: false })).toThrow(
      'Unsupported extraction provider'
    );
  });
});
