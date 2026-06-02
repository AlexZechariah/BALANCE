import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { auth, closeTestContext, createTestContext, ensureSeedUsers, login, seedUsers } from './helpers/backend-app';

describe('verified email policy', () => {
  it('allows onboarding reads but blocks selected high-trust mutations until verification', async () => {
    const ctx = await createTestContext();
    try {
      await ensureSeedUsers(ctx.prisma);
      await ctx.prisma.user.update({
        where: { email: seedUsers.orgAdmin.email },
        data: { emailVerifiedAt: null }
      });

      const admin = await login(ctx.app, 'orgAdmin');
      expect(admin.response.status).toBe(200);
      expect(admin.user.emailVerifiedAt).toBeNull();

      await request(ctx.app.getHttpServer())
        .get('/enterprise/members')
        .set('Cookie', admin.session.cookieHeader)
        .expect(200);

      const blockedRequest = request(ctx.app.getHttpServer())
        .post('/enterprise/members')
        .send({
          email: `blocked-${Date.now()}@balance.local`,
          password: 'valid local passphrase 1',
          displayName: 'Blocked Member',
          role: 'staff'
        });
      auth(admin.session)(blockedRequest);
      const blocked = await blockedRequest;
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toMatchObject({
        code: 'AUTH_EMAIL_VERIFICATION_REQUIRED',
        message: 'Verified email is required'
      });

      const auditEvent = await ctx.prisma.auditEvent.findFirst({
        where: { action: 'authz.denied', actorId: admin.user.id },
        orderBy: { createdAt: 'desc' }
      });
      expect(auditEvent?.metadata).toMatchObject({
        reason: 'email_verification_required',
        method: 'POST',
        route: '/enterprise/members'
      });
      expect(JSON.stringify(auditEvent?.metadata)).not.toMatch(/token|csrf|cookie|userAgent|ipAddress/i);
    } finally {
      await closeTestContext(ctx);
    }
  });

  it('allows verified users to retain selected high-trust access', async () => {
    const ctx = await createTestContext();
    try {
      await ensureSeedUsers(ctx.prisma);
      const admin = await login(ctx.app, 'orgAdmin');
      expect(admin.user.emailVerifiedAt).toEqual(expect.any(String));

      await request(ctx.app.getHttpServer())
        .get('/enterprise/members')
        .set('Cookie', admin.session.cookieHeader)
        .expect(200);
    } finally {
      await closeTestContext(ctx);
    }
  });
});
