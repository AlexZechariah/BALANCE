import { Inject, Injectable } from '@nestjs/common';
import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { PrismaService } from '../prisma/prisma.service';
import { authUserWithPasswordSelect, publicUserSelect } from '../prisma/selects';
import { throwContractHttpError } from '../common/contract-errors';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { PasswordHashingService } from './password-hashing.service';
import { hashSessionToken, SessionService } from './session.service';

type PublicUser = {
  id: string;
  email: string;
  role: string;
  displayName: string;
  organizationId: string | null;
  emailVerifiedAt: string | null;
};

function isPrismaKnownErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function prismaTargetIncludes(error: unknown, targetName: string): boolean {
  if (typeof error !== 'object' || error === null || !('meta' in error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes(targetName);
  return typeof target === 'string' && target.includes(targetName);
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordHashingService) private readonly passwords: PasswordHashingService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  private toPublicUser(user: { id: string; email: string; role: string; displayName: string; organizationId: string | null; emailVerifiedAt: Date | null }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      organizationId: user.organizationId,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null
    };
  }

  async login(email: string, password: string): Promise<{ user: PublicUser; sessionToken: string; csrfToken: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: authUserWithPasswordSelect
    });

    // Do not reveal whether the email exists.
    if (!user) {
      await this.passwords.verifyDummy(password);
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authLoginFailure,
        actor: { actorId: null, actorRole: 'anonymous' },
        entityId: 'anonymous',
        message: 'Login failed',
        metadata: { reason: 'invalid_credentials' }
      }).catch(() => undefined);
      throwContractHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials', []);
    }

    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authLoginFailure,
        actor: { actorId: user.id, actorRole: user.role },
        entityId: user.id,
        message: 'Login failed',
        metadata: { reason: 'invalid_credentials' },
        organizationId: user.organizationId
      }).catch(() => undefined);
      throwContractHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials', []);
    }

    const session = await this.sessions.createSession(user.id);
    await this.audit.writeSecurityEvent({
      action: SECURITY_AUDIT_ACTIONS.authLoginSuccess,
      actor: { actorId: user.id, actorRole: user.role },
      entityId: user.id,
      message: 'Login succeeded',
      metadata: { sessionExpiresAt: session.expiresAt.toISOString() },
      organizationId: user.organizationId
    }).catch(() => undefined);
    return { user: this.toPublicUser(user), ...session };
  }

  async me(userId: string): Promise<{ user: PublicUser }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect
    });
    if (!user) {
      // Token may be valid but user deleted/hidden; treat as invalid.
      throwContractHttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token', []);
    }
    return { user: this.toPublicUser(user) };
  }

  async register(
    email: string,
    password: string,
    displayName: string,
    orgName?: string
  ): Promise<{ user: PublicUser; sessionToken: string; csrfToken: string; expiresAt: Date }> {
    const passwordHash = await this.passwords.hash(password);

    const user = await this.prisma
      .$transaction(async (tx) => {
        // Check for an existing user without revealing whether the email exists.
        const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
          throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists', []);
        }

        let organizationId: string | undefined;

        if (orgName) {
          const existingOrg = await tx.organization.findUnique({ where: { name: orgName } });
          if (existingOrg) {
            throwContractHttpError(409, 'ORG_NAME_EXISTS', 'An organization with this name already exists', []);
          }

          const org = await tx.organization.create({
            data: { name: orgName }
          });
          organizationId = org.id;
        }

        return tx.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            role: orgName ? 'admin' : 'consumer',
            organizationId: organizationId ?? null
          },
          select: publicUserSelect
        });
      })
      .catch((error: unknown) => {
        if (isPrismaKnownErrorCode(error, 'P2002')) {
          if (prismaTargetIncludes(error, 'name')) {
            throwContractHttpError(409, 'ORG_NAME_EXISTS', 'An organization with this name already exists', []);
          }
          if (prismaTargetIncludes(error, 'email')) {
            throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists', []);
          }
        }
        throw error;
      });

    const session = await this.sessions.createSession(user.id);
    return { user: this.toPublicUser(user), ...session };
  }

  async logout(sessionToken: string, actor?: { id: string; role: string; organizationId: string | null }): Promise<{ ok: true }> {
    await this.sessions.revokeSession(sessionToken);
    if (actor) {
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authLogout,
        actor: { actorId: actor.id, actorRole: actor.role },
        entityId: actor.id,
        message: 'User logged out',
        metadata: { sessionRevoked: true },
        organizationId: actor.organizationId
      }).catch(() => undefined);
    }
    return { ok: true };
  }

  async listSessions(userId: string, currentSessionToken: string) {
    return { sessions: await this.sessions.listActiveSessionsForUser(userId, currentSessionToken) };
  }

  async revokeOtherSessions(user: { id: string; role: string; organizationId: string | null }, currentSessionToken: string): Promise<{ revokedCount: number }> {
    const revokedCount = await this.sessions.revokeOtherSessionsForUser(user.id, currentSessionToken);
    await this.audit.writeSecurityEvent({
      action: SECURITY_AUDIT_ACTIONS.authSessionRevoked,
      actor: { actorId: user.id, actorRole: user.role },
      entityId: user.id,
      message: 'Other sessions revoked by user',
      metadata: { revokedCount, preservedCurrentSession: true },
      organizationId: user.organizationId
    }).catch(() => undefined);
    return { revokedCount };
  }

  async updateAccount(
    userId: string,
    currentSessionToken: string | null | undefined,
    input: { displayName?: string | undefined; email?: string | undefined; currentPassword?: string | undefined; newPassword?: string | undefined }
  ): Promise<{ user: PublicUser }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserWithPasswordSelect
    });
    if (!user) {
      throwContractHttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token', []);
    }

    const sensitiveChange = Boolean(input.email && input.email !== user.email) || Boolean(input.newPassword);
    if (sensitiveChange) {
      if (!input.currentPassword) {
        throwContractHttpError(422, 'VALIDATION_ERROR', 'Current password is required', [
          { path: 'currentPassword', message: 'Current password is required for email or password changes' }
        ]);
      }

      const ok = await this.passwords.verify(user.passwordHash, input.currentPassword);
      if (!ok) {
        throwContractHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Current password is incorrect', []);
      }
    }

    const emailChanged = Boolean(input.email && input.email !== user.email);
    const passwordChanged = Boolean(input.newPassword);
    const data: { displayName?: string; email?: string; emailVerifiedAt?: Date | null; passwordHash?: string } = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (emailChanged && input.email) {
      data.email = input.email;
      data.emailVerifiedAt = null;
    }
    if (input.newPassword) data.passwordHash = await this.passwords.hash(input.newPassword);

    if (Object.keys(data).length === 0) {
      return { user: this.toPublicUser(user) };
    }

    const currentTokenHash = currentSessionToken ? hashSessionToken(currentSessionToken) : null;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data,
        select: publicUserSelect
      });

      if (emailChanged) {
        await tx.authAccountToken.updateMany({
          where: { userId: user.id, purpose: 'email_verification', consumedAt: null },
          data: { consumedAt: now }
        });
      }

      if (sensitiveChange) {
        const revoked = await tx.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
            ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {})
          },
          data: { revokedAt: now }
        });

        await this.audit.writeSecurityEvent({
          action: SECURITY_AUDIT_ACTIONS.authSessionRevoked,
          actor: { actorId: user.id, actorRole: user.role },
          entityId: user.id,
          message: 'Other sessions revoked after account change',
          metadata: { revokedCount: revoked.count, preservedCurrentSession: Boolean(currentTokenHash) },
          organizationId: user.organizationId
        }, tx);
      }

      if (emailChanged) {
        await this.audit.writeSecurityEvent({
          action: SECURITY_AUDIT_ACTIONS.authEmailChanged,
          actor: { actorId: user.id, actorRole: user.role },
          entityId: user.id,
          message: 'Account email changed and verification reset',
          metadata: { emailVerifiedAt: null },
          organizationId: user.organizationId
        }, tx);
      }

      if (passwordChanged) {
        await this.audit.writeSecurityEvent({
          action: SECURITY_AUDIT_ACTIONS.authPasswordChanged,
          actor: { actorId: user.id, actorRole: user.role },
          entityId: user.id,
          message: 'Account password changed',
          metadata: { otherSessionsRevoked: sensitiveChange },
          organizationId: user.organizationId
        }, tx);
      }

      return updatedUser;
    }).catch((error: unknown) => {
      if (isPrismaKnownErrorCode(error, 'P2002') && prismaTargetIncludes(error, 'email')) {
        throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists', []);
      }
      throw error;
    });

    return { user: this.toPublicUser(updated) };
  }
}
