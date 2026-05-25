import type { DocumentField, FieldName } from '@balance/db';
import { canonicalizeBalanceCategoryOrOther } from '@balance/types';

export type SpendField = Pick<DocumentField, 'name' | 'value' | 'correctedValue'>;

export interface SpendDocument {
  amountMinor: number | null;
  transactionDate?: string | null;
  documentDate: string | null;
  category?: string | null;
  createdAt: Date;
  fields?: SpendField[];
}

export function fieldValue(fields: readonly SpendField[] | undefined, name: FieldName): string | null {
  if (!fields) return null;
  return fields.find((field) => field.name === name)?.correctedValue ?? fields.find((field) => field.name === name)?.value ?? null;
}

export function amountLikeToMinor(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

export function effectiveDocumentAmountMinor(document: Pick<SpendDocument, 'amountMinor' | 'fields'>): number {
  return document.amountMinor ?? amountLikeToMinor(fieldValue(document.fields, 'total') ?? fieldValue(document.fields, 'amountMinor')) ?? 0;
}

export function effectiveDocumentDate(document: Pick<SpendDocument, 'transactionDate' | 'documentDate' | 'createdAt'>): string {
  return document.transactionDate ?? document.documentDate ?? document.createdAt.toISOString().slice(0, 10);
}

export function effectiveDocumentMonth(document: Pick<SpendDocument, 'transactionDate' | 'documentDate' | 'createdAt'>): string {
  return effectiveDocumentDate(document).slice(0, 7);
}

export function effectiveDocumentCategory(document: Pick<SpendDocument, 'category'>): string {
  return canonicalizeBalanceCategoryOrOther(document.category) ?? 'uncategorized';
}
