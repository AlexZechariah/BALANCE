import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SECURITY_AUDIT_ACTIONS } from '../src/audit/audit-event.constants';
import { AuthCleanupService } from '../src/auth/auth-cleanup.service';
import { EmailVerificationService } from '../src/auth/email-verification.service';
import { PasswordResetService } from '../src/auth/password-reset.service';
import { SessionService } from '../src/auth/session.service';
import { closeTestContext, createTestContext, ensureSeedUsers, resetWorkflowData, seedUsers } from './helpers/backend-app';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let app: INestApplication;
let passwordReset: PasswordResetService;
let emailVerification: EmailVerificationService;
let sessions: SessionService;
let authCleanup: AuthCleanupService;

function requireToken(token: string | null): string {
  if (!token) throw new Error('Expected token to be issued');
  return token;
}

describe('fallback auth account token lifecycle', () => {
  beforeAll(async () => {
    ctx = await createTestContext();
    app = ctx.app;
    passwordReset = app.get(PasswordResetService);
    emailVerification = app.get(EmailVerificationService);
    sessions = app.get(SessionService);
    authCleanup = app.get(AuthCleanupService);
    await ensureSeedUsers(ctx.prisma);
    await resetWorkflowData(ctx.prisma);
  });

  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it('stores password reset tokens hashed, consumes them once, changes the password, and revokes sessions', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: seedUsers.consumer.password
    }).expect(200);

    const issued = await passwordReset.createResetToken(seedUsers.consumer.email);
    expect(issued.token).toEqual(expect.any(String));
    const resetToken = requireToken(issued.token);
    expect(resetToken).not.toContain(seedUsers.consumer.email);

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.consumer.email } });
    const row = await ctx.prisma.authAccountToken.findFirstOrThrow({
      where: { userId: user.id, purpose: 'password_reset' },
      orderBy: { createdAt: 'desc' }
    });
    expect(row.tokenHash).not.toBe(resetToken);
    expect(row.consumedAt).toBeNull();

    await passwordReset.resetPassword(resetToken, 'reset local passphrase 1');

    const consumed = await ctx.prisma.authAccountToken.findUniqueOrThrow({ where: { id: row.id } });
    expect(consumed.consumedAt).toBeInstanceOf(Date);

    await agent.get('/auth/me').expect(401);
    await request(app.getHttpServer()).post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: seedUsers.consumer.password
    }).expect(401);
    await request(app.getHttpServer()).post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: 'reset local passphrase 1'
    }).expect(200);

    await expect(passwordReset.resetPassword(resetToken, 'another local passphrase 1')).rejects.toMatchObject({
      response: { error: { code: 'AUTH_RESET_TOKEN_INVALID' } }
    });

    await passwordReset.resetPassword(requireToken((await passwordReset.createResetToken(seedUsers.consumer.email)).token), seedUsers.consumer.password);
  });

  it('does not reveal unknown emails during reset-token creation', async () => {
    const issued = await passwordReset.createResetToken(`missing-${Date.now()}@balance.local`);
    expect(issued.token).toBeNull();
    expect(issued.expiresAt).toBeNull();
  });

  it('exposes generic password reset request and confirm routes without dev tokens by default', async () => {
    const existing = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ email: seedUsers.consumer.email })
      .expect(200);
    const missing = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ email: `missing-${Date.now()}@balance.local` })
      .expect(200);

    expect(existing.body).toEqual({ ok: true });
    expect(missing.body).toEqual({ ok: true });

    const resetToken = requireToken((await passwordReset.createResetToken(seedUsers.consumer.email)).token);
    await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token: resetToken, password: 'route reset passphrase 1' })
      .expect(200, { ok: true });

    await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token: resetToken, password: 'route reset passphrase 2' })
      .expect(401);

    await passwordReset.resetPassword(requireToken((await passwordReset.createResetToken(seedUsers.consumer.email)).token), seedUsers.consumer.password);
  });

  it('revokes expired sessions during cleanup without requiring token material', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.reviewer.email } });
    const now = new Date();
    const expired = await ctx.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: `expired-${Date.now()}`,
        csrfTokenHash: `csrf-${Date.now()}`,
        expiresAt: new Date(now.getTime() - 1_000)
      }
    });

    const count = await sessions.cleanupExpiredSessions(now);
    expect(count).toBeGreaterThanOrEqual(1);

    const row = await ctx.prisma.authSession.findUniqueOrThrow({ where: { id: expired.id } });
    expect(row.revokedAt).toEqual(now);
  });

  it('rejects expired password reset tokens', async () => {
    const issued = await passwordReset.createResetToken(seedUsers.reviewer.email);
    expect(issued.token).toEqual(expect.any(String));
    const resetToken = requireToken(issued.token);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.reviewer.email } });
    await ctx.prisma.authAccountToken.updateMany({
      where: { userId: user.id, purpose: 'password_reset', consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1_000) }
    });

    await expect(passwordReset.resetPassword(resetToken, 'expired local passphrase 1')).rejects.toMatchObject({
      response: { error: { code: 'AUTH_RESET_TOKEN_INVALID' } }
    });
  });

  it('stores email verification tokens hashed and verifies an email only once', async () => {
    const registered = await request(app.getHttpServer()).post('/auth/register').send({
      email: `verify-${Date.now()}@balance.local`,
      password: 'valid local passphrase 1',
      displayName: 'Verify User'
    }).expect(201);
    const userId = registered.body.user.id as string;

    const issued = await emailVerification.createVerificationToken(userId);
    expect(issued.token).toEqual(expect.any(String));

    const row = await ctx.prisma.authAccountToken.findFirstOrThrow({
      where: { userId, purpose: 'email_verification' },
      orderBy: { createdAt: 'desc' }
    });
    expect(row.tokenHash).not.toBe(issued.token);
    expect(row.consumedAt).toBeNull();

    const verified = await emailVerification.verifyEmail(issued.token);
    expect(verified.userId).toBe(userId);
    expect(verified.emailVerifiedAt).toBeInstanceOf(Date);

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);

    await expect(emailVerification.verifyEmail(issued.token)).rejects.toMatchObject({
      response: { error: { code: 'AUTH_VERIFICATION_TOKEN_INVALID' } }
    });
  });

  it('exposes generic email verification request and confirm routes without dev tokens by default', async () => {
    const email = `verify-route-${Date.now()}@balance.local`;
    const registered = await request(app.getHttpServer()).post('/auth/register').send({
      email,
      password: 'valid local passphrase 1',
      displayName: 'Verify Route User'
    }).expect(201);
    const userId = registered.body.user.id as string;

    const existing = await request(app.getHttpServer())
      .post('/auth/email-verification/request')
      .send({ email })
      .expect(200);
    const missing = await request(app.getHttpServer())
      .post('/auth/email-verification/request')
      .send({ email: `missing-${Date.now()}@balance.local` })
      .expect(200);

    expect(existing.body).toEqual({ ok: true });
    expect(missing.body).toEqual({ ok: true });

    const verificationToken = (await emailVerification.createVerificationToken(userId)).token;
    await request(app.getHttpServer())
      .post('/auth/email-verification/confirm')
      .send({ token: verificationToken })
      .expect(200, { ok: true });

    await request(app.getHttpServer())
      .post('/auth/email-verification/confirm')
      .send({ token: verificationToken })
      .expect(401);
  });

  it('rejects expired email verification tokens', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.staff.email } });
    const issued = await emailVerification.createVerificationToken(user.id);
    await ctx.prisma.authAccountToken.updateMany({
      where: { userId: user.id, purpose: 'email_verification', consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1_000) }
    });

    await expect(emailVerification.verifyEmail(issued.token)).rejects.toMatchObject({
      response: { error: { code: 'AUTH_VERIFICATION_TOKEN_INVALID' } }
    });
  });

  it('cleans expired and old consumed account tokens while preserving valid and recent tokens', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.reviewer.email } });
    const now = new Date('2026-06-04T12:00:00.000Z');
    const oldExpired = await ctx.prisma.authAccountToken.create({
      data: {
        userId: user.id,
        purpose: 'password_reset',
        tokenHash: `old-expired-${Date.now()}`,
        expiresAt: new Date(now.getTime() - 10 * 24 * 60 * 60_000)
      }
    });
    const oldConsumed = await ctx.prisma.authAccountToken.create({
      data: {
        userId: user.id,
        purpose: 'email_verification',
        tokenHash: `old-consumed-${Date.now()}`,
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: new Date(now.getTime() - 10 * 24 * 60 * 60_000)
      }
    });
    const recentConsumed = await ctx.prisma.authAccountToken.create({
      data: {
        userId: user.id,
        purpose: 'email_verification',
        tokenHash: `recent-consumed-${Date.now()}`,
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: new Date(now.getTime() - 60_000)
      }
    });
    const valid = await ctx.prisma.authAccountToken.create({
      data: {
        userId: user.id,
        purpose: 'password_reset',
        tokenHash: `valid-${Date.now()}`,
        expiresAt: new Date(now.getTime() + 60_000)
      }
    });

    const deleted = await sessions.cleanupExpiredAccountTokens(7, now);
    expect(deleted).toBeGreaterThanOrEqual(2);

    await expect(ctx.prisma.authAccountToken.findUniqueOrThrow({ where: { id: oldExpired.id } })).rejects.toThrow();
    await expect(ctx.prisma.authAccountToken.findUniqueOrThrow({ where: { id: oldConsumed.id } })).rejects.toThrow();
    await expect(ctx.prisma.authAccountToken.findUniqueOrThrow({ where: { id: recentConsumed.id } })).resolves.toMatchObject({ id: recentConsumed.id });
    await expect(ctx.prisma.authAccountToken.findUniqueOrThrow({ where: { id: valid.id } })).resolves.toMatchObject({ id: valid.id });
  });

  it('runs count-only authentication cleanup and writes a bounded audit event', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.reviewer.email } });
    const now = new Date('2026-06-05T12:00:00.000Z');

    await ctx.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: `cleanup-expired-session-${Date.now()}`,
        csrfTokenHash: `cleanup-expired-csrf-${Date.now()}`,
        expiresAt: new Date(now.getTime() - 1_000)
      }
    });
    await ctx.prisma.authAccountToken.create({
      data: {
        userId: user.id,
        purpose: 'password_reset',
        tokenHash: `cleanup-old-token-${Date.now()}`,
        expiresAt: new Date(now.getTime() - 8 * 24 * 60 * 60_000)
      }
    });

    const result = await authCleanup.run(now);
    expect(result.expiredSessionsRevoked).toBeGreaterThanOrEqual(1);
    expect(result.oldAccountTokensDeleted).toBeGreaterThanOrEqual(1);

    const event = await ctx.prisma.auditEvent.findFirstOrThrow({
      where: {
        action: SECURITY_AUDIT_ACTIONS.authSessionCleanup,
        entityType: 'security_event',
        entityId: 'auth-cleanup'
      },
      orderBy: { createdAt: 'desc' }
    });
    expect(event.actorRole).toBe('system');
    expect(event.metadata).toMatchObject({
      expiredSessionsRevoked: result.expiredSessionsRevoked,
      expiredOrConsumedRecordsDeleted: result.oldAccountTokensDeleted,
      accountRecordRetentionDays: 7
    });
    expect(JSON.stringify(event.metadata)).not.toContain(user.id);
  });
});
