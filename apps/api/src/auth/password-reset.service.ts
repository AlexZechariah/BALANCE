import { Inject, Injectable } from '@nestjs/common';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { throwContractHttpError } from '../common/contract-errors';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { createOpaqueAuthToken, expiresIn, hashOpaqueAuthToken } from './auth-token.util';
import { PasswordHashingService } from './password-hashing.service';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordHashingService) private readonly passwords: PasswordHashingService,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  async createResetToken(email: string): Promise<{ token: string | null; expiresAt: Date | null }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (!user) {
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authPasswordResetRequested,
        actor: { actorId: null, actorRole: 'anonymous' },
        entityId: 'anonymous',
        message: 'Password reset requested',
        metadata: { accountKnown: false }
      }).catch(() => undefined);
      return { token: null, expiresAt: null };
    }

    const token = createOpaqueAuthToken();
    const now = new Date();
    const expiresAt = expiresIn(PASSWORD_RESET_TTL_MS, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.authAccountToken.updateMany({
        where: { userId: user.id, purpose: 'password_reset', consumedAt: null },
        data: { consumedAt: now }
      });
      await tx.authAccountToken.create({
        data: {
          userId: user.id,
          purpose: 'password_reset',
          tokenHash: hashOpaqueAuthToken(token),
          expiresAt
        }
      });
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authPasswordResetRequested,
        actor: { actorId: user.id, actorRole: 'anonymous' },
        entityId: user.id,
        message: 'Password reset requested',
        metadata: { accountKnown: true, expiresAt: expiresAt.toISOString() }
      }, tx);
    });

    return { token, expiresAt };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ userId: string }> {
    const now = new Date();
    const tokenHash = hashOpaqueAuthToken(token);
    const stored = await this.prisma.authAccountToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        purpose: true,
        expiresAt: true,
        consumedAt: true
      }
    });

    if (!stored || stored.purpose !== 'password_reset' || stored.consumedAt || stored.expiresAt.getTime() <= now.getTime()) {
      throwContractHttpError(401, 'AUTH_RESET_TOKEN_INVALID', 'Invalid or expired reset token', []);
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authAccountToken.updateMany({
        where: {
          id: stored.id,
          purpose: 'password_reset',
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: { consumedAt: now }
      });

      if (consumed.count !== 1) {
        throwContractHttpError(401, 'AUTH_RESET_TOKEN_INVALID', 'Invalid or expired reset token', []);
      }

      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash }
      });

      await tx.authSession.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: now }
      });

      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authPasswordResetCompleted,
        actor: { actorId: stored.userId, actorRole: 'anonymous' },
        entityId: stored.userId,
        message: 'Password reset completed',
        metadata: { sessionsRevoked: true }
      }, tx);
    });

    return { userId: stored.userId };
  }
}
