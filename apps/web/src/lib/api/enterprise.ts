import { apiRequest } from './client';
import type { AuthUser } from './auth';
import type { ClaimStatus, DocumentStatus } from '@balance/types';
import type { PageInfo } from './documents';

export interface CreateMemberResponse {
  member: AuthUser;
}

export interface ListMembersResponse {
  members: AuthUser[];
}

export async function createMember(
  email: string,
  password: string,
  displayName: string,
  role: EnterpriseMemberRole,
): Promise<CreateMemberResponse> {
  return apiRequest<CreateMemberResponse>('/enterprise/members', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName, role }),
  });
}

export async function listMembers(): Promise<ListMembersResponse> {
  return apiRequest<ListMembersResponse>('/enterprise/members');
}

export async function deleteMember(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/enterprise/members/${id}`, {
    method: 'DELETE',
  });
}

export async function updateMemberRole(id: string, role: EnterpriseMemberRole): Promise<{ member: AuthUser }> {
  return apiRequest<{ member: AuthUser }>(`/enterprise/members/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function updateMember(
  id: string,
  input: { displayName?: string | undefined; email?: string | undefined; role?: EnterpriseMemberRole | undefined },
): Promise<{ member: AuthUser }> {
  return apiRequest<{ member: AuthUser }>(`/enterprise/members/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function resetMemberPassword(id: string, password: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/enterprise/members/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });
}

export type EnterpriseMemberRole = 'staff' | 'reviewer' | 'admin';

export interface EnterpriseClaimListItem {
  id: string;
  documentId: string;
  consumerId: string;
  status: ClaimStatus;
  purpose: string;
  note: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  consumer: { id: string; displayName: string; email: string };
  document: {
    id: string;
    ownerId: string;
    originalFilename: string;
    merchantName: string | null;
    amountMinor: number | null;
    currency: string | null;
    status: string;
  };
  review: { id: string; status: string; decisionNote: string | null; reviewerId: string | null; decidedAt: string | null } | null;
}

export async function listEnterpriseClaims(params?: {
  limit?: number;
  offset?: number;
  status?: ClaimStatus;
}): Promise<{ claims: EnterpriseClaimListItem[]; page: PageInfo }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.status) query.set('status', params.status);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/enterprise/claims${qs}`);
}

export interface EnterpriseDocumentListItem {
  id: string;
  ownerId: string;
  organizationId: string | null;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  status: DocumentStatus;
  label: string | null;
  notes: string | null;
  category: string | null;
  tags: string[];
  merchantName: string | null;
  documentDate: string | null;
  amountMinor: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; email: string; displayName: string; role: string };
  claim: { id: string; status: string } | null;
  review: { id: string; status: string } | null;
}

export async function listEnterpriseDocuments(params?: {
  limit?: number;
  offset?: number;
  status?: DocumentStatus;
  search?: string;
  category?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
}): Promise<{ documents: EnterpriseDocumentListItem[]; page: PageInfo }> {
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
  return apiRequest(`/enterprise/documents${qs}`);
}

export async function getEnterpriseDocumentOwner(id: string): Promise<{ document: { id: string; ownerId: string; organizationId: string | null; owner: { id: string; email: string; displayName: string; role: string } } }> {
  return apiRequest(`/enterprise/documents/${id}`);
}
