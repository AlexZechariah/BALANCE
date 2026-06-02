import { Inject, Injectable } from '@nestjs/common';
import { loadAppConfig } from '@balance/config';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { SessionService } from './session.service';

export type AuthCleanupResult = {
  expiredSessionsRevoked: number;
  oldAccountTokensDeleted: number;
};

@Injectable()
export class AuthCleanupService {
  private readonly config = loadAppConfig();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  async run(now = new Date()): Promise<AuthCleanupResult> {
    return this.prisma.$transaction(async (tx) => {
      const expiredSessionsRevoked = await this.sessions.cleanupExpiredSessions(now, tx);
      const oldAccountTokensDeleted = await this.sessions.cleanupExpiredAccountTokens(this.config.authAccountTokenRetentionDays, now, tx);

      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authSessionCleanup,
        actor: { actorId: null, actorRole: 'system' },
        entityId: 'auth-cleanup',
        message: 'Expired authentication records cleaned up',
        metadata: {
          expiredSessionsRevoked,
          expiredOrConsumedRecordsDeleted: oldAccountTokensDeleted,
          accountRecordRetentionDays: this.config.authAccountTokenRetentionDays
        }
      }, tx);

      return { expiredSessionsRevoked, oldAccountTokensDeleted };
    });
  }
}
