import { apiRequest } from './client';
import type { PageInfo } from './documents';

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorRole: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listAuditEvents(params: {
  documentId?: string;
  claimId?: string;
  reviewId?: string;
  action?: string;
  entityType?: string;
  actorRole?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ auditEvents: AuditEvent[]; page: PageInfo }> {
  const query = new URLSearchParams();
  if (params.documentId) query.set('documentId', params.documentId);
  if (params.claimId) query.set('claimId', params.claimId);
  if (params.reviewId) query.set('reviewId', params.reviewId);
  if (params.action) query.set('action', params.action);
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.actorRole) query.set('actorRole', params.actorRole);
  if (params.search) query.set('search', params.search);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  return apiRequest(`/audit?${query.toString()}`);
}

export interface AuditSummary {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  byEntityType: Array<{ entityType: string; count: number }>;
  byActorRole: Array<{ actorRole: string; count: number }>;
  failedExtractions: number;
  destructiveChanges: number;
  activeActorRoles: number;
  recentFailures: AuditEvent[];
}

export async function getAuditSummary(): Promise<{ summary: AuditSummary }> {
  return apiRequest('/audit/summary');
}
