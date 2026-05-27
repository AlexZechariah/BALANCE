import type { ExtractionProvider } from '@balance/types';

export type ProviderResolutionInput = {
  requestedProvider?: string | null | undefined;
  defaultProvider?: string | null | undefined;
  allowLegacyTextract: boolean;
};

export type ResolvedExtractionProvider = ExtractionProvider;
