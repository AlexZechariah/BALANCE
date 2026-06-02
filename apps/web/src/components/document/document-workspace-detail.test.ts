import { describe, expect, it } from 'vitest';

import { extractionFailureLabel } from './document-workspace-detail';

describe('document extraction warning UX', () => {
  it('turns the bounded PDF page-limit code into actionable user guidance', () => {
    expect(extractionFailureLabel('pdf_page_limit_exceeded')).toBe(
      'This PDF has more pages than the local extraction limit. Split the file into a smaller PDF, then upload or retry extraction.'
    );
  });

  it('does not expose unknown provider details as a raw exception', () => {
    expect(extractionFailureLabel('extraction_failed')).toBe(
      'Extraction failed. Retry after checking the local worker and OCR provider.'
    );
  });
});
