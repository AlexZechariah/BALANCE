import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PasswordHashingService } from '../src/auth/password-hashing.service';
import { closeTestContext, createTestContext, ensureSeedUsers, resetWorkflowData, seedUsers } from './helpers/backend-app';

const SESSION_COOKIE = 'balance.sid';
const CSRF_COOKIE = 'balance.csrf';
const CSRF_HEADER = 'x-csrf-token';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let app: INestApplication;
let passwords: PasswordHashingService;

function setCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

describe('fallback cookie session auth', () => {
  beforeAll(async () => {
    ctx = await createTestContext();
    app = ctx.app;
    passwords = app.get(PasswordHashingService);
    await ensureSeedUsers(ctx.prisma);
    await resetWorkflowData(ctx.prisma);
  });

  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it('logs in with an HttpOnly session cookie instead of a bearer access token', async () => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: seedUsers.consumer.password
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(seedUsers.consumer.email);
    expect(response.body.user.emailVerifiedAt).toEqual(expect.any(String));
    expect(response.body.accessToken).toBeUndefined();
    expect(typeof response.body.csrfToken).toBe('string');
    expect(response.body.csrfToken.length).toBeGreaterThan(20);

    const cookies = setCookies(response);
    expect(cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`) && cookie.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`) && !cookie.includes('HttpOnly'))).toBe(true);
  });

  it('uses the session cookie for /auth/me and rejects old bearer-only authentication', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: seedUsers.consumer.password
    });
    const csrfToken = login.body.csrfToken as string;

    const me = await agent.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(seedUsers.consumer.email);
    expect(me.body.csrfToken).toBe(csrfToken);

    const bearerOnly = await request(app.getHttpServer()).get('/auth/me').set('Authorization', 'Bearer old-local-storage-token');
    expect(bearerOnly.status).toBe(401);

    const updated = await agent
      .patch('/auth/me')
      .set(CSRF_HEADER, csrfToken)
      .send({ displayName: 'Cookie Session Consumer' });
    expect(updated.status).toBe(200);
    expect(updated.body.user.displayName).toBe('Cookie Session Consumer');
  });

  it('runs dummy password verification for missing users and mirrors invalid credential responses', async () => {
    const spy = vi.spyOn(passwords, 'verifyDummy');
    try {
      const missing = await request(app.getHttpServer()).post('/auth/login').send({
        email: `missing-${Date.now()}@balance.local`,
        password: 'missing local passphrase 1'
      });
      const wrongPassword = await request(app.getHttpServer()).post('/auth/login').send({
        email: seedUsers.consumer.email,
        password: 'wrong local passphrase 1'
      });

      expect(missing.status).toBe(401);
      expect(wrongPassword.status).toBe(401);
      expect(missing.body.error).toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials'
      });
      expect(wrongPassword.body.error).toMatchObject({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials'
      });
      expect(spy).toHaveBeenCalledWith('missing local passphrase 1');
    } finally {
      spy.mockRestore();
    }
  });

  it('requires CSRF proof for mutable authenticated routes', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({
      email: seedUsers.reviewer.email,
      password: seedUsers.reviewer.password
    });

    const missingCsrf = await agent.patch('/auth/me').send({ displayName: 'No CSRF Reviewer' });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe('CSRF_REQUIRED');
  });

  it('revokes the server-side session on logout', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send({
      email: seedUsers.reviewer.email,
      password: seedUsers.reviewer.password
    });
    const csrfToken = login.body.csrfToken as string;

    const beforeLogout = await agent.get('/auth/me');
    expect(beforeLogout.status).toBe(200);

    const logout = await agent.post('/auth/logout').set(CSRF_HEADER, csrfToken).send({});
    expect(logout.status).toBe(200);
    expect(setCookies(logout).some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`) && cookie.includes('Max-Age=0'))).toBe(true);

    const afterLogout = await agent.get('/auth/me');
    expect(afterLogout.status).toBe(401);
  });

  it('lists only safe active-session metadata and revokes other sessions', async () => {
    const currentAgent = request.agent(app.getHttpServer());
    const otherAgent = request.agent(app.getHttpServer());
    const currentLogin = await currentAgent.post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: seedUsers.consumer.password
    }).expect(200);
    await otherAgent.post('/auth/login').send({
      email: seedUsers.consumer.email,
      password: seedUsers.consumer.password
    }).expect(200);

    const sessions = await currentAgent.get('/auth/sessions').expect(200);
    expect(sessions.body.sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.body.sessions.filter((session: { isCurrent: boolean }) => session.isCurrent)).toHaveLength(1);
    expect(JSON.stringify(sessions.body)).not.toMatch(/token|csrf|cookie|userAgent|ipAddress/i);

    const revoked = await currentAgent
      .post('/auth/sessions/revoke-others')
      .set(CSRF_HEADER, currentLogin.body.csrfToken)
      .send({})
      .expect(200);
    expect(revoked.body.revokedCount).toBeGreaterThanOrEqual(1);

    await currentAgent.get('/auth/me').expect(200);
    await otherAgent.get('/auth/me').expect(401);

    const auditEvent = await ctx.prisma.auditEvent.findFirst({
      where: { action: 'auth.session.revoked', message: 'Other sessions revoked by user' },
      orderBy: { createdAt: 'desc' }
    });
    expect(auditEvent?.metadata).toMatchObject({ preservedCurrentSession: true });
    expect(JSON.stringify(auditEvent?.metadata)).not.toMatch(/token|csrf|cookie|userAgent|ipAddress/i);
  });

  it('revokes other sessions after a password change while preserving the current session', async () => {
    const email = `session-rotate-${Date.now()}@balance.local`;
    const originalPassword = 'original local passphrase 1';
    const rotatedPassword = 'rotated local passphrase 1';
    const currentAgent = request.agent(app.getHttpServer());
    const otherAgent = request.agent(app.getHttpServer());

    const registered = await currentAgent.post('/auth/register').send({
      email,
      password: originalPassword,
      displayName: 'Session Rotation'
    }).expect(201);
    const csrfToken = registered.body.csrfToken as string;

    await otherAgent.post('/auth/login').send({
      email,
      password: originalPassword
    }).expect(200);

    await currentAgent
      .patch('/auth/me')
      .set(CSRF_HEADER, csrfToken)
      .send({ currentPassword: originalPassword, newPassword: rotatedPassword })
      .expect(200);

    await currentAgent.get('/auth/me').expect(200);
    await otherAgent.get('/auth/me').expect(401);
    await request(app.getHttpServer()).post('/auth/login').send({ email, password: originalPassword }).expect(401);
    await request(app.getHttpServer()).post('/auth/login').send({ email, password: rotatedPassword }).expect(200);
  });

  it('clears email verification and revokes other sessions after an email change', async () => {
    const email = `email-rotate-${Date.now()}@balance.local`;
    const changedEmail = `email-rotated-${Date.now()}@balance.local`;
    const password = 'original local passphrase 1';
    const currentAgent = request.agent(app.getHttpServer());
    const otherAgent = request.agent(app.getHttpServer());

    const registered = await currentAgent.post('/auth/register').send({
      email,
      password,
      displayName: 'Email Rotation'
    }).expect(201);
    const csrfToken = registered.body.csrfToken as string;
    const userId = registered.body.user.id as string;

    await ctx.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() }
    });

    await otherAgent.post('/auth/login').send({ email, password }).expect(200);

    await currentAgent
      .patch('/auth/me')
      .set(CSRF_HEADER, csrfToken)
      .send({ currentPassword: password, email: changedEmail })
      .expect(200);

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(changedEmail);
    expect(user.emailVerifiedAt).toBeNull();

    await currentAgent.get('/auth/me').expect(200);
    await otherAgent.get('/auth/me').expect(401);
  });

  it('registers with a server-side session and no access token', async () => {
    const email = `session-${Date.now()}@balance.local`;
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      email,
      password: 'valid local passphrase 1',
      displayName: 'Session Register'
    });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe(email);
    expect(response.body.accessToken).toBeUndefined();
    expect(typeof response.body.csrfToken).toBe('string');
    expect(setCookies(response).some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`) && cookie.includes('HttpOnly'))).toBe(true);
  });
});
