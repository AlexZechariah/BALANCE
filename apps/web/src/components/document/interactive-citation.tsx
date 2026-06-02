'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { FileSearch, MapPin } from 'lucide-react';

/**
 * Context for interactive citations, linking document fields to their
 * source location in the document preview.
 */
interface CitationContextValue {
  /** Currently selected / active field ID */
  selectedFieldId: string | null;
  /** Page number for the selected field, when the extractor supplied one */
  selectedPageNumber: number | null;
  /** Select a field by ID (or null to clear) */
  selectField: (fieldId: string | null, pageNumber?: number | null) => void;
  /** Toggle a field into the highlighted set (multi-select) */
  toggleField: (fieldId: string) => void;
  /** Set of field IDs currently highlighted */
  highlightedFieldIds: Set<string>;
}

const CitationContext = createContext<CitationContextValue | null>(null);

/**
 * Hook to access interactive citation state.
 * Must be used within a CitationProvider.
 */
export function useCitation(): CitationContextValue {
  const ctx = useContext(CitationContext);
  if (!ctx) {
    throw new Error('useCitation must be used within a CitationProvider');
  }
  return ctx;
}

export function useOptionalCitation(): CitationContextValue | null {
  return useContext(CitationContext);
}

/**
 * Provider that wraps the document record, enabling
 * field-to-document interaction.
 */
export function CitationProvider({ children }: { children: ReactNode }) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(null);
  const [highlightedFieldIds, setHighlightedFieldIds] = useState<Set<string>>(new Set());

  const selectField = useCallback((fieldId: string | null, pageNumber?: number | null) => {
    setSelectedFieldId(fieldId);
    setSelectedPageNumber(fieldId ? pageNumber ?? null : null);
  }, []);

  const toggleField = useCallback((fieldId: string) => {
    setHighlightedFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }, []);

  return (
    <CitationContext.Provider value={{ selectedFieldId, selectedPageNumber, selectField, toggleField, highlightedFieldIds }}>
      {children}
    </CitationContext.Provider>
  );
}

/**
 * Displays citation metadata for a field, including page number and
 * geometry mapping info from OCR providers.
 */
export function CitationMetadata({
  pageNumber,
  geometry,
  label,
}: {
  pageNumber: number | null | undefined;
  geometry: Record<string, unknown> | null | undefined;
  label: string;
}) {
  if (!pageNumber && !geometry) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {pageNumber != null && (
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <FileSearch className="size-2.5" />
          Page {pageNumber}
        </span>
      )}
      {geometry && (
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <MapPin className="size-2.5" />
          {label}
        </span>
      )}
    </div>
  );
}
