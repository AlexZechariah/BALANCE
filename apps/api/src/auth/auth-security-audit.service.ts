import type { Prisma } from '@balance/db';
import { Inject, Injectable } from '@nestjs/common';

import { redactLogPayload } from '../logging/logger.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthAuditActor = {
  actorId: string | null;
  actorRole: string;
};

type AuthAuditClient = Prisma.TransactionClient | PrismaService;

export type AuthSecurityAuditInput = {
  action: string;
  actor: AuthAuditActor;
  entityId: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
  organizationId?: string | null;
};

@Injectable()
export class AuthSecurityAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async writeSecurityEvent(input: AuthSecurityAuditInput, client: AuthAuditClient = this.prisma): Promise<void> {
    await client.auditEvent.create({
      data: {
        action: input.action,
        entityType: 'security_event',
        entityId: input.entityId,
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        message: input.message,
        metadata: redactLogPayload(input.metadata ?? {}) as Prisma.InputJsonValue,
        organizationId: input.organizationId ?? null
      }
    });
  }
}
