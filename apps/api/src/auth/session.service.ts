import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@balance/db';

import { throwContractHttpError } from '../common/contract-errors';
import { sessionUserSelect } from '../prisma/selects';
import { PrismaService } from '../prisma/prisma.service';
import { SESSION_TTL_MS } from './session.constants';
import type { AuthenticatedRequestUser } from './auth.guard';

type ValidatedSession = {
  user: AuthenticatedRequestUser;
  csrfTokenHash: string;
};

type SessionCleanupClient = Prisma.TransactionClient | PrismaService;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class SessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createSession(userId: string): Promise<{ sessionToken: string; csrfToken: string; expiresAt: Date }> {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: hashSessionToken(sessionToken),
        csrfTokenHash: hashSessionToken(csrfToken),
        expiresAt
      }
    });

    return { sessionToken, csrfToken, expiresAt };
  }

  async validateSession(sessionToken: string): Promise<ValidatedSession> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(sessionToken) },
      select: {
        csrfTokenHash: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: sessionUserSelect
        }
      }
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throwContractHttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired session', []);
    }

    return {
      csrfTokenHash: session.csrfTokenHash,
      user: {
        id: session.user.id,
        role: session.user.role,
        email: session.user.email,
        organizationId: session.user.organizationId,
        emailVerifiedAt: session.user.emailVerifiedAt
      }
    };
  }

  async listActiveSessionsForUser(userId: string, currentSessionToken: string): Promise<Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    isCurrent: boolean;
  }>> {
    const currentTokenHash = hashSessionToken(currentSessionToken);
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        tokenHash: true,
        createdAt: true,
        expiresAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      isCurrent: session.tokenHash === currentTokenHash
    }));
  }

  async revokeSession(sessionToken: string): Promise<void> {
    await this.prisma.authSession
      .update({
        where: { tokenHash: hashSessionToken(sessionToken) },
        data: { revokedAt: new Date() }
      })
      .catch(() => undefined);
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
    return result.count;
  }

  async revokeOtherSessionsForUser(userId: string, currentSessionToken: string | null | undefined): Promise<number> {
    const currentTokenHash = currentSessionToken ? hashSessionToken(currentSessionToken) : null;
    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {})
      },
      data: { revokedAt: new Date() }
    });
    return result.count;
  }

  async cleanupExpiredSessions(now = new Date(), client: SessionCleanupClient = this.prisma): Promise<number> {
    const result = await client.authSession.updateMany({
      where: {
        revokedAt: null,
        expiresAt: { lte: now }
      },
      data: { revokedAt: now }
    });
    return result.count;
  }

  async cleanupExpiredAccountTokens(
    retentionWindowDays = 7,
    now = new Date(),
    client: SessionCleanupClient = this.prisma
  ): Promise<number> {
    const retentionCutoff = new Date(now.getTime() - retentionWindowDays * 24 * 60 * 60_000);
    const result = await client.authAccountToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: retentionCutoff } },
          { consumedAt: { lt: retentionCutoff } }
        ]
      }
    });
    return result.count;
  }

  validateCsrf(session: ValidatedSession, submittedToken: string | null | undefined) {
    if (!submittedToken) {
      throwContractHttpError(403, 'CSRF_REQUIRED', 'CSRF token is required', []);
    }

    if (!safeEqualHex(session.csrfTokenHash, hashSessionToken(submittedToken))) {
      throwContractHttpError(403, 'CSRF_REQUIRED', 'CSRF token is required', []);
    }
  }
}
