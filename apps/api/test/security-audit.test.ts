import request from 'supertest';
import { Role } from '@balance/db';
import { describe, expect, it } from 'vitest';

import { SECURITY_AUDIT_ACTIONS } from '../src/audit/audit-event.constants';
import { AuditService } from '../src/audit/audit.service';
import { SecurityAuditService } from '../src/audit/security-audit.service';
import { closeTestContext, createTestContext, ensureSeedUsers, seedUsers } from './helpers/backend-app';

describe('security audit events', () => {
  it('writes security_event audit entries with redacted metadata', async () => {
    const ctx = await createTestContext();
    try {
      await ensureSeedUsers(ctx.prisma);
      const service = ctx.app.get(SecurityAuditService);
      const actor = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'consumer@balance.local' } });

      await service.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authLoginSuccess,
        actor: { actorId: actor.id, actorRole: Role.consumer },
        entityId: actor.id,
        message: 'Login succeeded',
        metadata: {
          password: 'valid local passphrase 1',
          sessionToken: 'session-secret',
          rawOcrText: 'PRIVATE OCR TEXT'
        }
      });

      const event = await ctx.prisma.auditEvent.findFirstOrThrow({
        where: { action: SECURITY_AUDIT_ACTIONS.authLoginSuccess, entityType: 'security_event', entityId: actor.id },
        orderBy: { createdAt: 'desc' }
      });

      expect(event.metadata).toMatchObject({
        password: '[redacted]',
        sessionToken: '[redacted]',
        rawOcrText: '[redacted]'
      });
      expect(JSON.stringify(event.metadata)).not.toContain('valid local passphrase 1');
      expect(JSON.stringify(event.metadata)).not.toContain('session-secret');
      expect(JSON.stringify(event.metadata)).not.toContain('PRIVATE OCR TEXT');

      const ordinaryAudit = ctx.app.get(AuditService);
      await ordinaryAudit.writeEvent({
        action: 'document.privacy_test',
        entityType: 'document',
        entityId: actor.id,
        actor: { actorId: actor.id, actorRole: Role.consumer },
        message: 'Ordinary audit redaction test',
        metadata: {
          originalFilename: 'private-receipt.pdf',
          nested: { storageKey: 'documents/private-receipt.pdf' },
          originalFilenameAgain: 'private-receipt-2.pdf'
        }
      });
      const ordinaryEvent = await ctx.prisma.auditEvent.findFirstOrThrow({
        where: { action: 'document.privacy_test', entityId: actor.id },
        orderBy: { createdAt: 'desc' }
      });
      expect(ordinaryEvent.metadata).toMatchObject({
        originalFilename: '[redacted]',
        nested: { storageKey: '[redacted]' },
        originalFilenameAgain: '[redacted]'
      });
    } finally {
      await closeTestContext(ctx);
    }
  });

  it('writes safe auth success, failure, and CSRF audit events through routes', async () => {
    const ctx = await createTestContext();
    try {
      await ensureSeedUsers(ctx.prisma);

      const agent = request.agent(ctx.app.getHttpServer());
      const failed = await request(ctx.app.getHttpServer()).post('/auth/login').send({
        email: seedUsers.consumer.email,
        password: 'wrong local passphrase 1'
      });
      expect(failed.status).toBe(401);

      const login = await agent.post('/auth/login').send({
        email: seedUsers.consumer.email,
        password: seedUsers.consumer.password
      });
      expect(login.status).toBe(200);

      await agent.patch('/auth/me').send({ displayName: 'Missing CSRF' }).expect(403);

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: seedUsers.consumer.email } });
      const actions = await ctx.prisma.auditEvent.findMany({
        where: {
          entityType: 'security_event',
          action: {
            in: [
              SECURITY_AUDIT_ACTIONS.authLoginFailure,
              SECURITY_AUDIT_ACTIONS.authLoginSuccess,
              SECURITY_AUDIT_ACTIONS.authCsrfFailed
            ]
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(actions.map((event) => event.action)).toEqual(expect.arrayContaining([
        SECURITY_AUDIT_ACTIONS.authLoginFailure,
        SECURITY_AUDIT_ACTIONS.authLoginSuccess,
        SECURITY_AUDIT_ACTIONS.authCsrfFailed
      ]));
      expect(JSON.stringify(actions.map((event) => event.metadata))).not.toContain(seedUsers.consumer.password);
      expect(actions.some((event) => event.action === SECURITY_AUDIT_ACTIONS.authLoginSuccess && event.actorId === user.id)).toBe(true);
      const csrfEvent = actions.find((event) => event.action === SECURITY_AUDIT_ACTIONS.authCsrfFailed);
      expect(csrfEvent?.metadata).toMatchObject({ method: 'PATCH', route: '/auth/me' });
      expect(csrfEvent?.metadata).not.toHaveProperty('path');
    } finally {
      await closeTestContext(ctx);
    }
  });
});
