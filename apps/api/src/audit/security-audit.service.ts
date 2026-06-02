import type { EntityType, Prisma } from '@balance/db';
import { Inject, Injectable } from '@nestjs/common';

import { redactLogPayload } from '../logging/logger.service';

import { AuditService, type AuditActor } from './audit.service';

export type SecurityAuditInput = {
  action: string;
  actor: AuditActor;
  entityId: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
  organizationId?: string | null;
};

@Injectable()
export class SecurityAuditService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async writeSecurityEvent(input: SecurityAuditInput): Promise<void> {
    await this.audit.writeEvent({
      action: input.action,
      entityType: 'security_event' as EntityType,
      entityId: input.entityId,
      actor: input.actor,
      message: input.message,
      metadata: redactLogPayload(input.metadata ?? {}) as Prisma.InputJsonValue,
      organizationId: input.organizationId ?? null
    });
  }
}
