import { Inject, Injectable } from '@nestjs/common';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { throwContractHttpError } from '../common/contract-errors';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { createOpaqueAuthToken, expiresIn, hashOpaqueAuthToken } from './auth-token.util';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  async createVerificationTokenForEmail(email: string): Promise<{ token: string | null; expiresAt: Date | null }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (!user) {
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authEmailVerificationRequested,
        actor: { actorId: null, actorRole: 'anonymous' },
        entityId: 'anonymous',
        message: 'Email verification requested',
        metadata: { accountKnown: false }
      }).catch(() => undefined);
      return { token: null, expiresAt: null };
    }

    return this.createVerificationToken(user.id, 'anonymous');
  }

  async createVerificationToken(userId: string, actorRole = 'anonymous'): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true }
    });

    if (!user) {
      throwContractHttpError(404, 'AUTH_USER_NOT_FOUND', 'User not found', []);
    }

    const token = createOpaqueAuthToken();
    const now = new Date();
    const expiresAt = expiresIn(EMAIL_VERIFICATION_TTL_MS, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.authAccountToken.updateMany({
        where: { userId, purpose: 'email_verification', consumedAt: null },
        data: { consumedAt: now }
      });
      await tx.authAccountToken.create({
        data: {
          userId,
          purpose: 'email_verification',
          tokenHash: hashOpaqueAuthToken(token),
          expiresAt
        }
      });
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authEmailVerificationRequested,
        actor: { actorId: user.id, actorRole },
        entityId: user.id,
        message: 'Email verification requested',
        metadata: { accountKnown: true, expiresAt: expiresAt.toISOString() },
        organizationId: user.organizationId
      }, tx);
    });

    return { token, expiresAt };
  }

  async verifyEmail(token: string): Promise<{ userId: string; emailVerifiedAt: Date }> {
    const now = new Date();
    const stored = await this.prisma.authAccountToken.findUnique({
      where: { tokenHash: hashOpaqueAuthToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        expiresAt: true,
        consumedAt: true
      }
    });

    if (!stored || stored.purpose !== 'email_verification' || stored.consumedAt || stored.expiresAt.getTime() <= now.getTime()) {
      throwContractHttpError(401, 'AUTH_VERIFICATION_TOKEN_INVALID', 'Invalid or expired verification token', []);
    }

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authAccountToken.updateMany({
        where: {
          id: stored.id,
          purpose: 'email_verification',
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: { consumedAt: now }
      });

      if (consumed.count !== 1) {
        throwContractHttpError(401, 'AUTH_VERIFICATION_TOKEN_INVALID', 'Invalid or expired verification token', []);
      }

      await tx.user.update({
        where: { id: stored.userId },
        data: { emailVerifiedAt: now }
      });

      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authEmailVerificationCompleted,
        actor: { actorId: stored.userId, actorRole: 'anonymous' },
        entityId: stored.userId,
        message: 'Email verification completed',
        metadata: { emailVerifiedAt: now.toISOString() }
      }, tx);
    });

    return { userId: stored.userId, emailVerifiedAt: now };
  }
}
