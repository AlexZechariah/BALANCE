import { Inject, Injectable } from '@nestjs/common';
import type { EntityType, Prisma } from '@balance/db';

import { PrismaService } from '../prisma/prisma.service';

export type AuditActor = {
  actorId: string | null;
  actorRole: string;
};

export type AuditCreateInput = {
  action: string;
  entityType: EntityType;
  entityId: string;
  actor: AuditActor;
  message: string;
  metadata?: Prisma.InputJsonValue;

  documentId?: string | null;
  extractionJobId?: string | null;
  claimId?: string | null;
  reviewId?: string | null;
  organizationId?: string | null;
};

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async resolveOrganizationId(input: AuditCreateInput): Promise<string | null> {
    if (input.organizationId !== undefined) return input.organizationId;

    if (input.documentId) {
      const document = await this.prisma.document.findUnique({
        where: { id: input.documentId },
        select: { organizationId: true }
      });
      if (document?.organizationId) return document.organizationId;
    }

    if (input.claimId) {
      const claim = await this.prisma.claim.findUnique({
        where: { id: input.claimId },
        select: { organizationId: true, document: { select: { organizationId: true } } }
      });
      if (claim?.organizationId) return claim.organizationId;
      if (claim?.document.organizationId) return claim.document.organizationId;
    }

    if (input.reviewId) {
      const review = await this.prisma.review.findUnique({
        where: { id: input.reviewId },
        select: { document: { select: { organizationId: true } } }
      });
      if (review?.document.organizationId) return review.document.organizationId;
    }

    if (input.extractionJobId) {
      const job = await this.prisma.extractionJob.findUnique({
        where: { id: input.extractionJobId },
        select: { document: { select: { organizationId: true } } }
      });
      if (job?.document.organizationId) return job.document.organizationId;
    }

    return null;
  }

  async writeEvent(input: AuditCreateInput): Promise<void> {
    const organizationId = await this.resolveOrganizationId(input);

    await this.prisma.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        message: input.message,
        metadata: input.metadata ?? {},
        documentId: input.documentId ?? null,
        extractionJobId: input.extractionJobId ?? null,
        claimId: input.claimId ?? null,
        reviewId: input.reviewId ?? null,
        organizationId
      }
    });
  }
}
