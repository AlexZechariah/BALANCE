import { Injectable } from '@nestjs/common';

import { EXTRACTION_PIPELINE_VERSION } from './extraction.constants';
import { resolveExtractionProvider } from './extraction.validation';

@Injectable()
export class ExtractionService {
  getPipelineVersion(): string {
    return EXTRACTION_PIPELINE_VERSION;
  }

  resolveProvider(requestedProvider?: string | null) {
    return resolveExtractionProvider({
      requestedProvider,
      defaultProvider: process.env.EXTRACTION_PROVIDER_DEFAULT,
      allowLegacyTextract: process.env.EXTRACTION_ALLOW_LEGACY_TEXTRACT === 'true'
    });
  }
}
