'use client';

import { useState, useCallback } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { saveDocumentCorrections, type CorrectionField } from '@/lib/api/documents';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts `snake_case` or `camelCase` identifiers into human-readable labels.
 * Examples: `merchantName` → `Merchant Name`, `receiptId` → `Receipt ID`,
 * `tax_amount` → `Tax Amount`, `businessUnit` → `Business Unit`.
 */
function formatFieldName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Returns true when the trimmed value contains digits or a currency prefix. */
function looksNumeric(value: string): boolean {
  const stripped = value.replace(/[RMUSD€£¥,.\s]/g, '');
  return stripped.length > 0 && /^\d+$/.test(stripped);
}

// ---------------------------------------------------------------------------
// Confidence badge variant
// ---------------------------------------------------------------------------

function badgeVariantForConfidence(confidence: number | null) {
  if (confidence === null) return 'default' as const;
  if (confidence >= 90) return 'success' as const;
  if (confidence >= 70) return 'warning' as const;
  return 'danger' as const;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldItem {
  id: string;
  name: string;
  value: string;
  correctedValue: string | null;
  confidence: number | null;
  source: string;
}

interface ClaimReviewPanelProps {
  fields: FieldItem[];
  documentId: string;
  /** If false, fields are read-only (no edit button). Defaults to true. */
  editable?: boolean;
  /** Called after corrections are saved successfully. */
  onCorrectionsSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClaimReviewPanel({
  fields: initialFields,
  documentId,
  editable = true,
  onCorrectionsSaved,
}: ClaimReviewPanelProps) {
  const [fields, setFields] = useState<FieldItem[]>(initialFields);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartEdit = useCallback((field: FieldItem) => {
    setEditingFieldId(field.id);
    setEditValue(field.correctedValue ?? field.value);
    setError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingFieldId(null);
    setEditValue('');
    setError(null);
  }, []);

  const handleSave = useCallback(
    async (field: FieldItem) => {
      const trimmed = editValue.trim();
      if (trimmed === (field.correctedValue ?? field.value)) {
        // No change; just close the editor.
        handleCancelEdit();
        return;
      }

      setSavingField(true);
      setError(null);

      try {
        const corrections: CorrectionField[] = [
          { id: field.id, name: field.name, correctedValue: trimmed },
        ];
        await saveDocumentCorrections(documentId, corrections);

        // Update local state
        setFields((prev) =>
          prev.map((f) => (f.id === field.id ? { ...f, correctedValue: trimmed } : f)),
        );
        setEditingFieldId(null);
        setEditValue('');
        onCorrectionsSaved?.();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to save correction. Please try again.';
        setError(message);
      } finally {
        setSavingField(false);
      }
    },
    [documentId, editValue, handleCancelEdit, onCorrectionsSaved],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Extracted Fields</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-4">
        {fields.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No fields were extracted from this document.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => {
              const isEditing = editingFieldId === field.id;
              const numeric = looksNumeric(field.value);

              return (
                <div
                  key={field.id}
                  className={cn(
                    'group relative rounded-md border p-3 transition-colors',
                    isEditing
                      ? 'border-ring bg-background'
                      : 'border-border bg-background/60',
                  )}
                >
                  {/* Header row: label + confidence */}
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {formatFieldName(field.name)}
                    </span>

                    {field.confidence !== null ? (
                      <Badge variant={badgeVariantForConfidence(field.confidence)}>
                        {field.confidence.toFixed(0)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">&mdash;</span>
                    )}
                  </div>

                  {/* Value area */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-sm"
                        disabled={savingField}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !savingField) {
                            handleSave(field);
                          }
                          if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                      />
                      {error && (
                        <p className="text-xs text-destructive">{error}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          numeric && 'font-mono tabular-nums',
                          field.correctedValue && 'line-through text-muted-foreground',
                        )}
                      >
                        {field.value}
                      </span>
                      {field.correctedValue && (
                        <div
                          className={cn(
                            'text-sm font-medium text-foreground',
                            numeric && 'font-mono tabular-nums',
                          )}
                        >
                          {field.correctedValue}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Edit / action buttons */}
                  {editable && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSave(field)}
                            disabled={savingField}
                            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-45"
                          >
                            <Check className="size-4" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={savingField}
                            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-45"
                          >
                            <X className="size-4" />
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(field)}
                          className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
