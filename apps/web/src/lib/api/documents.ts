import type { DocumentStatus, ExtractionJobStatus, ExtractionProvider } from '@balance/types';
import { apiRequest, apiUpload } from './client';

export interface DocumentField {
  id: string;
  name: string;
  label: string;
  value: string;
  correctedValue: string | null;
  confidence: number | null;
  source: 'ocr' | 'manual' | 'system';
  groupKey: string | null;
  rawType?: string | null;
  rawLabel?: string | null;
  normalizedValue?: string | null;
  valueType?: string | null;
  pageNumber?: number | null;
  geometry?: Record<string, unknown> | null;
  validationStatus?: string | null;
  reviewState?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ExtractionJob {
  id: string;
  documentId?: string;
  status: ExtractionJobStatus;
  provider: string;
  warningCodes?: string[];
  confidenceSummary?: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DocumentSummary {
  id: string;
  ownerId: string;
  originalFilename: string;
  label: string | null;
  notes: string | null;
  contentType: string;
  sizeBytes: number;
  status: DocumentStatus;
  documentType?: string | null;
  category?: string | null;
  claimIntent?: string | null;
  tags?: string[];
  qualityScore?: number | null;
  qualityWarnings?: string[];
  duplicateFingerprint?: string | null;
  transactionDate?: string | null;
  transactionTime?: string | null;
  retentionUntil?: string | null;
  previewAvailable?: boolean;
  extractionSummary?: Record<string, unknown>;
  merchantName: string | null;
  documentDate: string | null;
  amountMinor: number | null;
  currency: string | null;
  fields?: DocumentField[];
  review?: { id: string; status: string; decisionNote: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  fields: DocumentField[];
  extractionJob: (ExtractionJob & {
    artifact?: {
      id: string;
      artifactType?: string | null;
      stage?: string | null;
      payload?: Record<string, unknown>;
      normalized?: Record<string, unknown>;
      warnings?: string[];
      createdAt: string;
    } | null;
  }) | null;
  claim: { id: string; status: string } | null;
  review: { id: string; status: string; decisionNote: string | null } | null;
}

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export interface UploadDocumentResponse {
  document: DocumentSummary;
  extractionJob: ExtractionJob;
}

export interface CorrectionField {
  id?: string;
  name: string;
  correctedValue: string | null;
}

export async function uploadDocument(
  file: File,
  label?: string,
  notes?: string,
  category?: string,
  tags?: string,
  claimIntent?: string,
  documentType?: string,
): Promise<UploadDocumentResponse> {
  const form = new FormData();
  form.append('file', file);
  if (label) form.append('label', label);
  if (notes) form.append('notes', notes);
  if (category) form.append('category', category);
  if (tags) form.append('tags', tags);
  if (claimIntent) form.append('claimIntent', claimIntent);
  if (documentType) form.append('documentType', documentType);
  return apiUpload<UploadDocumentResponse>('/documents', form);
}

export async function listDocuments(params?: {
  limit?: number;
  offset?: number;
  status?: DocumentStatus;
  search?: string;
  category?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
}): Promise<{ documents: DocumentSummary[]; page: PageInfo }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', params.category);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.minAmount != null) query.set('minAmount', String(params.minAmount));
  if (params?.maxAmount != null) query.set('maxAmount', String(params.maxAmount));
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/documents${qs}`);
}

export interface DocumentInsights {
  currentMonthSpendMinor: number;
  previousMonthSpendMinor: number;
  monthOverMonthChange: number | null;
  currentMonthDocumentCount: number;
  totalTaxMinor: number;
  totalServiceChargeMinor: number;
  totalDiscountMinor: number;
  averageReceiptMinor: number;
  largestDocument: DocumentSummary | null;
  mostFrequentMerchant: { merchantName: string; count: number } | null;
  topMerchantBySpend: { merchantName: string; amountMinor: number } | null;
  statusCounts: Record<string, number>;
  claimCounts: Record<string, number>;
  monthlySpend: Array<{ month: string; amountMinor: number; count: number }>;
  merchantSpend: Array<{ merchantName: string; amountMinor: number; count: number }>;
  categorySpend: Array<{ category: string; amountMinor: number; count: number }>;
  recordTypeSpend: Array<{ recordType: string; amountMinor: number; count: number }>;
  recentDocuments: DocumentSummary[];
  recentClaims: Array<{ id: string; status: string; purpose: string; amountMinor: number | null; merchantName: string | null; currency: string | null }>;
  summary: {
    totalDocuments: number;
    totalAmountMinor: number;
    currentMonthAmountMinor: number;
    previousMonthAmountMinor: number;
    monthOverMonthDeltaMinor: number;
    needsReviewCount: number;
    failedCount: number;
    processingCount: number;
    claimableAmountMinor: number;
    statusCounts: Record<string, number>;
    claimStatusCounts: Record<string, number>;
  };
  lastUpdatedAt: string;
}

export async function getDocumentInsights(): Promise<{ insights: DocumentInsights }> {
  return apiRequest('/documents/insights');
}

export async function getDocument(id: string): Promise<{ document: DocumentDetail }> {
  return apiRequest(`/documents/${id}`);
}

export async function saveDocumentCorrections(
  id: string,
  fields: CorrectionField[],
): Promise<{ document: DocumentDetail }> {
  return apiRequest(`/documents/${id}/corrections`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

export async function retryDocumentExtraction(
  id: string,
  provider?: ExtractionProvider,
): Promise<UploadDocumentResponse> {
  return apiRequest(`/documents/${id}/extraction/retry`, {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

export async function updateDocumentMetadata(
  id: string,
  patch: { label?: string | null; notes?: string | null; category?: string | null; documentType?: string | null; tags?: string[]; retentionUntil?: string | null },
): Promise<{ document: DocumentDetail }> {
  return apiRequest(`/documents/${id}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getDocumentTimeline(id: string): Promise<{ auditEvents: Array<{ id: string; action: string; message: string; actorRole: string; entityType: string; entityId: string; metadata: Record<string, unknown>; createdAt: string }> }> {
  return apiRequest(`/documents/${id}/timeline`);
}

export async function getDocumentDuplicates(id: string): Promise<{ duplicates: DocumentSummary[] }> {
  return apiRequest(`/documents/${id}/duplicates`);
}

export async function deleteDocument(id: string): Promise<void> {
  await apiRequest(`/documents/${id}`, { method: 'DELETE' });
}

export async function deleteAllDocuments(): Promise<{ deletedCount: number; claimCount: number }> {
  return apiRequest('/documents', { method: 'DELETE' });
}
