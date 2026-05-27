import {
  ACTIVE_EXTRACTION_PROVIDERS,
  DEFAULT_EXTRACTION_PROVIDER,
  LEGACY_DISABLED_EXTRACTION_PROVIDERS
} from './extraction.constants';
import type { ProviderResolutionInput, ResolvedExtractionProvider } from './extraction-provider.types';

export class ExtractionProviderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionProviderValidationError';
  }
}

export function resolveExtractionProvider(input: ProviderResolutionInput): ResolvedExtractionProvider {
  const requested = normalizeProvider(input.requestedProvider);
  const configuredDefault = normalizeProvider(input.defaultProvider);
  const provider = requested || configuredDefault || DEFAULT_EXTRACTION_PROVIDER;

  if (ACTIVE_EXTRACTION_PROVIDERS.has(provider)) {
    return provider as ResolvedExtractionProvider;
  }

  if (LEGACY_DISABLED_EXTRACTION_PROVIDERS.has(provider)) {
    if (input.allowLegacyTextract) {
      return provider as ResolvedExtractionProvider;
    }
    throw new ExtractionProviderValidationError('legacy_textract is disabled by default');
  }

  throw new ExtractionProviderValidationError(`Unsupported extraction provider: ${provider}`);
}

function normalizeProvider(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}
