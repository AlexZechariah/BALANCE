import { Inject, Injectable } from '@nestjs/common';
import type { ClaimStatus, DocumentStatus, Prisma, ReviewStatus } from '@balance/db';

import { AuditService } from '../audit/audit.service';
import {
  isSystemAdminRole,
} from '../auth/access-policy';
import { throwContractHttpError } from '../common/contract-errors';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedPrismaService } from '../prisma/scoped-prisma.service';

@Injectable()
export class ClaimsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopedPrismaService) private readonly scoped: ScopedPrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(input: {
    consumerId: string;
    actorRole: string;
    organizationId?: string | null;
    documentId: string;
    purpose: string;
    note?: string | null;
  }) {
    const actor = { id: input.consumerId, role: input.actorRole, organizationId: input.organizationId ?? null };
    const doc = await this.scoped.findDocument(actor, input.documentId, {
      include: { claim: true }
    });

    if (!doc) throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    if (doc.ownerId !== input.consumerId) throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);

    if (doc.claim && doc.claim.status !== 'draft') {
      throwContractHttpError(409, 'CONFLICT', 'Conflict', []);
    }

    if (doc.status !== 'extracted' && doc.status !== 'corrected') {
      throwContractHttpError(409, 'CONFLICT', 'Conflict', []);
    }

    if (input.actorRole !== 'consumer') {
      if (!input.organizationId || !doc.organizationId || doc.organizationId !== input.organizationId) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
    }

    const submittedAt = new Date();
    const isResubmit = Boolean(doc.claim);

    const result = await this.prisma.$transaction(async (tx) => {
      const claim = doc.claim
        ? await tx.claim.update({
            where: { id: doc.claim.id },
            data: {
              organizationId: doc.organizationId ?? null,
              status: 'submitted' satisfies ClaimStatus,
              purpose: input.purpose,
              note: input.note ?? null,
              submittedAt,
              decidedAt: null
            }
          })
        : await tx.claim.create({
            data: {
              documentId: doc.id,
              consumerId: input.consumerId,
              organizationId: doc.organizationId ?? null,
              status: 'submitted' satisfies ClaimStatus,
              purpose: input.purpose,
              note: input.note ?? null,
              submittedAt
            }
          });

      const review = await tx.review.create({
        data: {
          claimId: claim.id,
          documentId: doc.id,
          status: 'pending' satisfies ReviewStatus,
          reviewerId: null,
          decisionNote: null
        }
      });

      await tx.document.update({
        where: { id: doc.id },
        data: { status: 'submitted' satisfies DocumentStatus }
      });

      return { claim, review };
    });

    await this.audit.writeEvent({
      action: isResubmit ? 'claim.resubmitted' : 'claim.submitted',
      entityType: 'claim',
      entityId: result.claim.id,
      actor: { actorId: input.consumerId, actorRole: input.actorRole },
      message: isResubmit ? 'Claim resubmitted' : 'Claim submitted',
      metadata: {},
      documentId: doc.id,
      claimId: result.claim.id,
      reviewId: result.review.id
    });

    return {
      claim: {
        id: result.claim.id,
        documentId: result.claim.documentId,
        consumerId: result.claim.consumerId,
        status: result.claim.status,
        purpose: result.claim.purpose,
        note: result.claim.note,
        submittedAt: result.claim.submittedAt?.toISOString() ?? null,
        decidedAt: result.claim.decidedAt?.toISOString() ?? null,
        createdAt: result.claim.createdAt.toISOString(),
        updatedAt: result.claim.updatedAt.toISOString()
      },
      review: {
        id: result.review.id,
        claimId: result.review.claimId,
        documentId: result.review.documentId,
        status: result.review.status,
        reviewerId: result.review.reviewerId,
        decisionNote: result.review.decisionNote,
        createdAt: result.review.createdAt.toISOString(),
        updatedAt: result.review.updatedAt.toISOString()
      }
    };
  }

  async recall(input: { claimId: string; actorId: string; actorRole: string; organizationId?: string | null }) {
    const actor = { id: input.actorId, role: input.actorRole, organizationId: input.organizationId ?? null };
    const claim = await this.scoped.findClaim(actor, input.claimId, {
      include: {
        review: { select: { id: true, status: true, reviewerId: true } },
        document: { select: { id: true, ownerId: true, organizationId: true, status: true, originalFilename: true } }
      }
    });

    if (!claim) {
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    if (!isSystemAdminRole(input.actorRole) && claim.consumerId !== input.actorId) {
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    if (input.actorRole !== 'consumer' && !isSystemAdminRole(input.actorRole)) {
      if (!input.organizationId || !claim.organizationId || claim.organizationId !== input.organizationId) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
    }

    if (claim.status !== 'submitted') {
      throwContractHttpError(409, 'CONFLICT', 'Conflict', []);
    }

    if (!claim.review || claim.review.status !== 'pending' || claim.review.reviewerId) {
      throwContractHttpError(409, 'CONFLICT', 'Conflict', []);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const hasCorrections = await tx.documentField.findFirst({
        where: { documentId: claim.documentId, correctedValue: { not: null } },
        select: { id: true }
      });

      await tx.review.delete({ where: { id: claim.review!.id } });

      const updatedClaim = await tx.claim.update({
        where: { id: claim.id },
        data: {
          status: 'draft' satisfies ClaimStatus,
          submittedAt: null,
          decidedAt: null
        }
      });

      const updatedDoc = await tx.document.update({
        where: { id: claim.documentId },
        data: { status: (hasCorrections ? 'corrected' : 'extracted') satisfies DocumentStatus }
      });

      return { claim: updatedClaim, document: updatedDoc };
    });

    await this.audit.writeEvent({
      action: 'claim.recalled',
      entityType: 'claim',
      entityId: claim.id,
      actor: { actorId: input.actorId, actorRole: input.actorRole },
      message: 'Claim recalled',
      metadata: {},
      documentId: claim.documentId,
      claimId: claim.id
    });

    return {
      claim: {
        id: result.claim.id,
        status: result.claim.status,
        updatedAt: result.claim.updatedAt.toISOString()
      },
      document: {
        id: result.document.id,
        status: result.document.status
      }
    };
  }

  async list(input: { consumerId: string; limit: number; offset: number; status?: ClaimStatus }) {
    const where: Prisma.ClaimWhereInput = { consumerId: input.consumerId };
    if (input.status) where.status = input.status;
    else where.status = { not: 'draft' };

    const [claims, total] = await Promise.all([
      this.prisma.claim.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        take: input.limit,
        skip: input.offset,
      include: {
        consumer: { select: { id: true, displayName: true, email: true } },
        document: {
            select: {
              id: true,
              originalFilename: true,
              merchantName: true,
              amountMinor: true,
              currency: true,
              status: true
            }
          }
        }
      }),
      this.prisma.claim.count({ where })
    ]);

    return {
      claims: claims.map((c) => ({
        id: c.id,
        documentId: c.documentId,
        status: c.status,
        purpose: c.purpose,
        note: c.note,
        submittedAt: c.submittedAt?.toISOString() ?? null,
        decidedAt: c.decidedAt?.toISOString() ?? null,
        document: {
          id: c.document.id,
          originalFilename: c.document.originalFilename,
          merchantName: c.document.merchantName,
          amountMinor: c.document.amountMinor,
          currency: c.document.currency,
          status: c.document.status
        }
      })),
      page: { limit: input.limit, offset: input.offset, total }
    };
  }

  async insights(input: { consumerId: string }) {
    const claims = await this.prisma.claim.findMany({
      where: { consumerId: input.consumerId },
      include: {
        document: {
          select: {
            id: true,
            originalFilename: true,
            merchantName: true,
            amountMinor: true,
            currency: true,
            category: true,
            transactionDate: true
          }
        },
        review: {
          select: {
            id: true,
            status: true,
            decisionNote: true,
            decidedAt: true
          }
        }
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }]
    });

    const visibleClaims = claims.filter((claim) => claim.status !== 'draft');

    const statusCounts = visibleClaims.reduce<Record<ClaimStatus, number>>(
      (acc, claim) => {
        acc[claim.status] += 1;
        return acc;
      },
      { draft: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0 }
    );

    const amountFor = (statuses: ClaimStatus[]) =>
      visibleClaims
        .filter((claim) => statuses.includes(claim.status))
        .reduce((sum, claim) => sum + (claim.document.amountMinor ?? 0), 0);

    return {
      insights: {
        totalClaims: visibleClaims.length,
        statusCounts,
        approvedAmountMinor: amountFor(['approved']),
        pendingAmountMinor: amountFor(['submitted', 'under_review']),
        rejectedAmountMinor: amountFor(['rejected']),
        recentClaims: visibleClaims.slice(0, 8).map((claim) => ({
          id: claim.id,
          documentId: claim.documentId,
          status: claim.status,
          purpose: claim.purpose,
          submittedAt: claim.submittedAt?.toISOString() ?? null,
          decidedAt: claim.decidedAt?.toISOString() ?? null,
          amountMinor: claim.document.amountMinor,
          currency: claim.document.currency,
          merchantName: claim.document.merchantName,
          originalFilename: claim.document.originalFilename,
          review: claim.review
            ? {
                id: claim.review.id,
                status: claim.review.status,
                decisionNote: claim.review.decisionNote,
                decidedAt: claim.review.decidedAt?.toISOString() ?? null
              }
            : null
        }))
      }
    };
  }

  async getById(input: { userId: string; role: string; organizationId?: string | null; id: string }) {
    const actor = { id: input.userId, role: input.role, organizationId: input.organizationId ?? null };
    const claim = await this.scoped.findClaim(actor, input.id, {
      include: {
        consumer: { select: { id: true, displayName: true, email: true } },
        document: {
          select: {
            id: true,
            originalFilename: true,
            contentType: true,
            status: true,
            merchantName: true,
            documentDate: true,
            amountMinor: true,
            currency: true,
            organizationId: true,
            fields: {
              select: {
                id: true,
                name: true,
                value: true,
                correctedValue: true,
                confidence: true,
                source: true
              }
            }
          }
        },
        review: {
          select: {
            id: true,
            status: true,
            reviewerId: true,
            decisionNote: true
          }
        }
      }
    });

    if (!claim) {
      if (input.role !== 'consumer' && await this.scoped.claimExists(input.id)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    const auditEvents = await this.prisma.auditEvent.findMany({
      where: {
        OR: [
          { claimId: claim.id },
          { documentId: claim.documentId }
        ]
      },
      orderBy: { createdAt: 'asc' },
      take: 50
    });

    return {
      claim: {
        id: claim.id,
        documentId: claim.documentId,
        consumerId: claim.consumerId,
        status: claim.status,
        purpose: claim.purpose,
        note: claim.note,
        submittedAt: claim.submittedAt?.toISOString() ?? null,
        decidedAt: claim.decidedAt?.toISOString() ?? null,
        consumer: claim.consumer,
        document: {
          id: claim.document.id,
          originalFilename: claim.document.originalFilename,
          contentType: claim.document.contentType,
          status: claim.document.status,
          merchantName: claim.document.merchantName,
          documentDate: claim.document.documentDate,
          amountMinor: claim.document.amountMinor,
          currency: claim.document.currency,
          fields: claim.document.fields.map(f => ({
            id: f.id,
            name: f.name,
            value: f.value,
            correctedValue: f.correctedValue,
            confidence: f.confidence,
            source: f.source
          }))
        },
        review: claim.review
          ? {
              id: claim.review.id,
              status: claim.review.status,
              reviewerId: claim.review.reviewerId,
              decisionNote: claim.review.decisionNote
            }
          : null,
        auditEvents: auditEvents.map(e => ({ id: e.id, action: e.action, entityType: e.entityType, actorRole: e.actorRole, message: e.message, createdAt: e.createdAt.toISOString() }))
      }
    };
  }
}
