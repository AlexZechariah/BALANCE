import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { PrismaScopeService } from '../src/authorization/prisma-scope.service';
import {
  PRISMA_SECURITY_RULES,
  reviewedRawSqlReasons,
  unsafeRawSqlApis
} from '../src/prisma/prisma-security.rules';
import { ScopedPrismaService } from '../src/prisma/scoped-prisma.service';

const repoRoot = path.resolve(__dirname, '../../..');

const reviewer = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'reviewer@balance.local',
  role: 'reviewer',
  organizationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
};

const consumer = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'consumer@balance.local',
  role: 'consumer',
  organizationId: null
};

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Prisma database security guardrails', () => {
  it('defines reviewed raw SQL, transaction, and explicit select rules', () => {
    expect(unsafeRawSqlApis).toEqual(['$queryRawUnsafe', '$executeRawUnsafe']);
    expect(reviewedRawSqlReasons).toEqual(expect.arrayContaining(['readiness-check']));
    expect(PRISMA_SECURITY_RULES.transactionRequiredFor).toEqual(
      expect.arrayContaining([
        'auth session revocation',
        'password reset completion',
        'email verification completion',
        'document delete',
        'extraction retry',
        'claim submission',
        'review assignment',
        'review approval',
        'review rejection',
        'membership role change'
      ])
    );
  });

  it('scopes reviewer database access to visible review work instead of the whole organization', () => {
    const scopes = new PrismaScopeService();

    expect(scopes.documentWhere(reviewer)).toEqual({
      AND: [
        { organizationId: reviewer.organizationId },
        { review: { is: { OR: [{ status: 'pending', reviewerId: null }, { reviewerId: reviewer.id }] } } }
      ]
    });
    expect(scopes.claimWhere(reviewer)).toEqual({
      AND: [
        { organizationId: reviewer.organizationId },
        { review: { is: { OR: [{ status: 'pending', reviewerId: null }, { reviewerId: reviewer.id }] } } }
      ]
    });
  });

  it('combines object id, actor scope, and caller select shape for scoped object reads', async () => {
    const prisma = {
      document: { findFirst: vi.fn().mockResolvedValue(null) },
      claim: { findFirst: vi.fn().mockResolvedValue(null) },
      review: { findFirst: vi.fn().mockResolvedValue(null) },
      budget: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      auditEvent: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }
    };
    const scoped = new ScopedPrismaService(prisma as never, new PrismaScopeService());

    await scoped.findDocument(consumer, 'document-id', {
      select: { id: true, ownerId: true }
    });
    await scoped.findClaim(consumer, 'claim-id', {
      select: { id: true, consumerId: true }
    });
    await scoped.findBudget(consumer, 'budget-id', {
      select: { id: true, userId: true }
    });

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      select: { id: true, ownerId: true },
      where: { AND: [{ id: 'document-id' }, { ownerId: consumer.id }] }
    });
    expect(prisma.claim.findFirst).toHaveBeenCalledWith({
      select: { id: true, consumerId: true },
      where: { AND: [{ id: 'claim-id' }, { consumerId: consumer.id }] }
    });
    expect(prisma.budget.findFirst).toHaveBeenCalledWith({
      select: { id: true, userId: true },
      where: { AND: [{ id: 'budget-id' }, { userId: consumer.id }] }
    });
  });

  it('keeps unsafe raw SQL APIs and string-concatenated SQL out of active source', () => {
    const prismaService = source('apps/api/src/prisma/prisma.service.ts');
    expect(prismaService).not.toContain('$queryRawUnsafe');
    expect(prismaService).not.toContain('$executeRawUnsafe');

    const securityScript = path.join(repoRoot, 'scripts/security/prisma.sh');
    expect(existsSync(securityScript)).toBe(true);

    const script = readFileSync(securityScript, 'utf8');
    expect(script).toContain('$queryRawUnsafe');
    expect(script).toContain('$executeRawUnsafe');
    expect(script).toContain('string-concatenated SQL');
  });
});
