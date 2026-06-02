import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { AuditController } from '../src/audit/audit.controller';
import { AuthController } from '../src/auth/auth.controller';
import { BudgetsController } from '../src/budgets/budgets.controller';
import { ClaimsController } from '../src/claims/claims.controller';
import { DocumentsController } from '../src/documents/documents.controller';
import { EnterpriseController } from '../src/enterprise/enterprise.controller';
import { QUEUE_ABUSE_LIMITS } from '../src/rate-limit/queue-abuse-limits';
import { BALANCE_RATE_LIMIT_POLICY_METADATA, RATE_LIMITS } from '../src/rate-limit/rate-limit.constants';
import { ReviewsController } from '../src/reviews/reviews.controller';

function policyFor(controller: object, method: string): keyof typeof RATE_LIMITS | undefined {
  const handler = (controller as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`Missing controller method ${method}`);
  }
  return Reflect.getMetadata(BALANCE_RATE_LIMIT_POLICY_METADATA, handler) as keyof typeof RATE_LIMITS | undefined;
}

describe('rate-limit policy wiring', () => {
  it('defines endpoint limits for required Phase 07 surfaces', () => {
    expect(RATE_LIMITS.auth.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.read.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.list.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.insights.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.metrics.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.upload.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.preview.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.retry.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.claim.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.review.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.membership.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.audit.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.sensitive.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.auth.ttl).toBeGreaterThan(0);
  });

  it('marks required controller handlers with explicit rate-limit policies', () => {
    expect(policyFor(AuthController.prototype, 'login')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'register')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'requestPasswordReset')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'confirmPasswordReset')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'requestEmailVerification')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'confirmEmailVerification')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'logout')).toBe('auth');
    expect(policyFor(AuthController.prototype, 'sessions')).toBe('sensitive');
    expect(policyFor(AuthController.prototype, 'revokeOtherSessions')).toBe('sensitive');
    expect(policyFor(BudgetsController.prototype, 'list')).toBe('list');
    expect(policyFor(BudgetsController.prototype, 'create')).toBe('sensitive');
    expect(policyFor(BudgetsController.prototype, 'update')).toBe('sensitive');
    expect(policyFor(BudgetsController.prototype, 'delete')).toBe('sensitive');
    expect(policyFor(DocumentsController.prototype, 'upload')).toBe('upload');
    expect(policyFor(DocumentsController.prototype, 'list')).toBe('list');
    expect(policyFor(DocumentsController.prototype, 'insights')).toBe('insights');
    expect(policyFor(DocumentsController.prototype, 'detail')).toBe('read');
    expect(policyFor(DocumentsController.prototype, 'preview')).toBe('preview');
    expect(policyFor(DocumentsController.prototype, 'timeline')).toBe('read');
    expect(policyFor(DocumentsController.prototype, 'duplicates')).toBe('list');
    expect(policyFor(DocumentsController.prototype, 'updateMetadata')).toBe('sensitive');
    expect(policyFor(DocumentsController.prototype, 'corrections')).toBe('sensitive');
    expect(policyFor(DocumentsController.prototype, 'retryExtraction')).toBe('retry');
    expect(policyFor(DocumentsController.prototype, 'deleteDocument')).toBe('sensitive');
    expect(policyFor(DocumentsController.prototype, 'deleteAllDocuments')).toBe('sensitive');
    expect(policyFor(ClaimsController.prototype, 'create')).toBe('claim');
    expect(policyFor(ClaimsController.prototype, 'list')).toBe('list');
    expect(policyFor(ClaimsController.prototype, 'insights')).toBe('insights');
    expect(policyFor(ClaimsController.prototype, 'detail')).toBe('read');
    expect(policyFor(ClaimsController.prototype, 'recall')).toBe('claim');
    expect(policyFor(ReviewsController.prototype, 'queue')).toBe('list');
    expect(policyFor(ReviewsController.prototype, 'metrics')).toBe('metrics');
    expect(policyFor(ReviewsController.prototype, 'detail')).toBe('read');
    expect(policyFor(ReviewsController.prototype, 'claim')).toBe('review');
    expect(policyFor(ReviewsController.prototype, 'assign')).toBe('review');
    expect(policyFor(ReviewsController.prototype, 'unassign')).toBe('review');
    expect(policyFor(ReviewsController.prototype, 'approve')).toBe('review');
    expect(policyFor(ReviewsController.prototype, 'reject')).toBe('review');
    expect(policyFor(EnterpriseController.prototype, 'createMember')).toBe('membership');
    expect(policyFor(EnterpriseController.prototype, 'listMembers')).toBe('list');
    expect(policyFor(EnterpriseController.prototype, 'listClaims')).toBe('list');
    expect(policyFor(EnterpriseController.prototype, 'listDocuments')).toBe('list');
    expect(policyFor(EnterpriseController.prototype, 'documentDetail')).toBe('read');
    expect(policyFor(EnterpriseController.prototype, 'deleteMember')).toBe('membership');
    expect(policyFor(EnterpriseController.prototype, 'updateMemberRole')).toBe('membership');
    expect(policyFor(AuditController.prototype, 'list')).toBe('audit');
    expect(policyFor(AuditController.prototype, 'summary')).toBe('metrics');
  });

  it('defines queue abuse limits for extraction retries and user queued jobs', () => {
    expect(QUEUE_ABUSE_LIMITS.maxExtractionRetriesPerDocumentPerHour).toBeGreaterThan(0);
    expect(QUEUE_ABUSE_LIMITS.maxQueuedExtractionJobsPerUser).toBeGreaterThan(0);
  });
});
