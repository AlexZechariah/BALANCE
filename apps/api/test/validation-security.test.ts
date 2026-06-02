import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  accountUpdateRequestSchema,
  budgetCreateRequestSchema,
  budgetUpdateRequestSchema,
  claimSubmissionPayloadSchema,
  correctionPayloadSchema,
  createMemberRequestSchema,
  documentMetadataPatchSchema,
  documentUploadMetadataSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetMemberPasswordRequestSchema,
  reviewApprovePayloadSchema,
  reviewRejectPayloadSchema,
  updateMemberRequestSchema,
  updateMemberRoleRequestSchema
} from '@balance/schemas';

const id = '11111111-1111-4111-8111-111111111111';

function expectDangerousFieldRejected(schema: z.ZodType, base: Record<string, unknown>, dangerous: Record<string, unknown>) {
  const result = schema.safeParse({ ...base, ...dangerous });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
  }
}

describe('strict input schemas', () => {
  it('enforces the shared NIST-aligned password policy without composition rules', () => {
    expect(registerRequestSchema.safeParse({
      email: 'short@balance.local',
      password: 'short password',
      displayName: 'Short Password'
    }).success).toBe(false);
    expect(registerRequestSchema.safeParse({
      email: 'common@balance.local',
      password: 'balance password',
      displayName: 'Common Password'
    }).success).toBe(false);
    expect(registerRequestSchema.safeParse({
      email: 'phrase@balance.local',
      password: 'valid local passphrase 1',
      displayName: 'Phrase Password'
    }).success).toBe(true);
  });

  it('rejects dangerous fields on auth request bodies', () => {
    expectDangerousFieldRejected(
      loginRequestSchema,
      { email: 'consumer@balance.local', password: 'valid local passphrase 1' },
      { role: 'system_admin' }
    );
    expectDangerousFieldRejected(
      registerRequestSchema,
      { email: 'new@balance.local', password: 'valid local passphrase 1', displayName: 'New User' },
      { id, organizationId: id, role: 'admin' }
    );
    expectDangerousFieldRejected(
      accountUpdateRequestSchema,
      { displayName: 'Renamed User' },
      { userId: id, role: 'admin' }
    );
  });

  it('rejects dangerous fields on document and extraction request bodies', () => {
    expectDangerousFieldRejected(
      documentUploadMetadataSchema,
      { label: 'Receipt', category: 'travel' },
      { ownerId: id, status: 'extracted', storageKey: 'documents/other/original.pdf' }
    );
    expectDangerousFieldRejected(
      documentMetadataPatchSchema,
      { label: 'Updated Receipt' },
      { organizationId: id, storageProvider: 's3', storagePath: '/private/path' }
    );
    expectDangerousFieldRejected(
      correctionPayloadSchema,
      { fields: [{ name: 'total', correctedValue: '12.34' }] },
      { status: 'approved', updatedAt: '2026-05-31T00:00:00.000Z' }
    );
  });

  it('rejects dangerous fields on claim and review request bodies', () => {
    expectDangerousFieldRejected(
      claimSubmissionPayloadSchema,
      { documentId: id, purpose: 'Travel reimbursement' },
      { ownerId: id, status: 'approved', reviewerId: id }
    );
    expectDangerousFieldRejected(
      reviewApprovePayloadSchema,
      { note: 'Approved' },
      { approvedBy: id, status: 'approved' }
    );
    expectDangerousFieldRejected(
      reviewRejectPayloadSchema,
      { note: 'Missing receipt details' },
      { rejectedBy: id, status: 'rejected' }
    );
  });

  it('rejects dangerous fields on enterprise member and budget request bodies', () => {
    expectDangerousFieldRejected(
      createMemberRequestSchema,
      { email: 'staff@balance.local', password: 'valid local passphrase 1', displayName: 'Staff' },
      { id, organizationId: id, createdAt: '2026-05-31T00:00:00.000Z' }
    );
    expectDangerousFieldRejected(updateMemberRoleRequestSchema, { role: 'staff' }, { userId: id, updatedAt: '2026-05-31T00:00:00.000Z' });
    expectDangerousFieldRejected(updateMemberRequestSchema, { displayName: 'Staff Two' }, { organizationId: id, status: 'active' });
    expectDangerousFieldRejected(resetMemberPasswordRequestSchema, { password: 'valid local passphrase 1' }, { userId: id });
    expectDangerousFieldRejected(budgetCreateRequestSchema, { category: 'travel', amountMinor: 1000 }, { ownerId: id });
    expectDangerousFieldRejected(budgetUpdateRequestSchema, { amountMinor: 2000 }, { userId: id, approvedBy: id });
  });
});
