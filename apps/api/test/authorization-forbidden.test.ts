import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  auth,
  closeTestContext,
  createDocument,
  createTestContext,
  ensureSeedUsers,
  login,
  resetWorkflowData,
  sessionFromResponse,
  type TestContext
} from './helpers/backend-app';

describe.sequential('authorization forbidden mirrors', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await ensureSeedUsers(ctx.prisma);
  });

  beforeEach(async () => {
    await resetWorkflowData(ctx.prisma);
  });

  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it('checks every document object-ID route against the server-derived actor', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const otherRegistered = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `authz-doc-other-${Date.now()}@balance.local`,
        password: 'valid local passphrase 1',
        displayName: 'Authz Other Consumer'
      })
      .expect(201);
    const otherSession = sessionFromResponse(otherRegistered);
    const otherUser = otherRegistered.body.user as { id: string };

    const ownDocument = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      originalFilename: 'authz-own.pdf'
    });
    const foreignDocument = await createDocument(ctx.prisma, {
      ownerId: otherUser.id,
      status: 'extracted',
      originalFilename: 'authz-foreign.pdf'
    });

    await request(ctx.app.getHttpServer()).get(`/documents/${ownDocument.id}`).use(auth(consumer.session)).expect(200);
    await request(ctx.app.getHttpServer()).get(`/documents/${foreignDocument.id}`).use(auth(consumer.session)).expect(404);

    await request(ctx.app.getHttpServer()).get(`/documents/${ownDocument.id}/preview`).use(auth(consumer.session)).expect(200);
    await request(ctx.app.getHttpServer()).get(`/documents/${foreignDocument.id}/preview`).use(auth(consumer.session)).expect(404);

    await request(ctx.app.getHttpServer()).get(`/documents/${foreignDocument.id}/timeline`).use(auth(consumer.session)).expect(404);
    await request(ctx.app.getHttpServer()).get(`/documents/${foreignDocument.id}/duplicates`).use(auth(consumer.session)).expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/documents/${foreignDocument.id}/metadata`)
      .use(auth(consumer.session))
      .send({ label: 'stolen label' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .patch(`/documents/${foreignDocument.id}/corrections`)
      .use(auth(consumer.session))
      .send({ fields: [{ name: 'merchantName', correctedValue: 'Wrong Merchant' }] })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/documents/${foreignDocument.id}/extraction/retry`)
      .use(auth(consumer.session))
      .send({ provider: 'paddleocr' })
      .expect(403);

    await request(ctx.app.getHttpServer()).delete(`/documents/${foreignDocument.id}`).use(auth(consumer.session)).expect(403);

    await request(ctx.app.getHttpServer()).get(`/documents/${foreignDocument.id}`).use(auth(otherSession)).expect(200);
  });

  it('forbids cross-user claim, budget, audit, organization, membership, storage, and review object access', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const orgAdmin = await login(ctx.app, 'orgAdmin');
    const systemAdmin = await login(ctx.app, 'admin');

    const otherRegistered = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `authz-other-${Date.now()}@balance.local`,
        password: 'valid local passphrase 1',
        displayName: 'Authz Other Consumer'
      })
      .expect(201);
    const otherSession = sessionFromResponse(otherRegistered);
    const otherUser = otherRegistered.body.user as { id: string };

    const otherDocument = await createDocument(ctx.prisma, {
      ownerId: otherUser.id,
      status: 'submitted',
      originalFilename: 'authz-claim.pdf'
    });
    const otherClaim = await ctx.prisma.claim.create({
      data: {
        documentId: otherDocument.id,
        consumerId: otherUser.id,
        organizationId: null,
        status: 'submitted',
        purpose: 'expense',
        note: null,
        submittedAt: new Date()
      }
    });
    const otherReview = await ctx.prisma.review.create({
      data: {
        documentId: otherDocument.id,
        claimId: otherClaim.id,
        status: 'pending',
        reviewerId: null,
        decisionNote: null
      }
    });
    const otherBudget = await ctx.prisma.budget.create({
      data: {
        userId: otherUser.id,
        category: 'meals',
        month: '2026-05',
        amountMinor: 5000,
        currency: 'MYR'
      }
    });
    await ctx.prisma.auditEvent.create({
      data: {
        action: 'document.viewed',
        entityType: 'document',
        entityId: otherDocument.id,
        actorId: otherUser.id,
        actorRole: 'consumer',
        message: 'Foreign audit event',
        metadata: {},
        documentId: otherDocument.id
      }
    });

    await request(ctx.app.getHttpServer()).get(`/claims/${otherClaim.id}`).use(auth(consumer.session)).expect(404);
    await request(ctx.app.getHttpServer()).get(`/claims/${otherClaim.id}`).use(auth(otherSession)).expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/budgets/${otherBudget.id}`)
      .use(auth(consumer.session))
      .send({ amountMinor: 1 })
      .expect(404);
    await request(ctx.app.getHttpServer()).delete(`/budgets/${otherBudget.id}`).use(auth(consumer.session)).expect(404);

    await request(ctx.app.getHttpServer()).get(`/audit?documentId=${otherDocument.id}`).use(auth(consumer.session)).expect(403);

    const otherOrg = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `authz-other-org-${Date.now()}@balance.local`,
        password: 'valid local passphrase 1',
        displayName: 'Other Org Admin',
        orgName: `Other Authz Org ${Date.now()}`
      })
      .expect(201);
    const otherOrgSession = sessionFromResponse(otherOrg);
    const otherOrgUser = otherOrg.body.user as { id: string; organizationId: string };
    await ctx.prisma.user.update({
      where: { id: otherOrgUser.id },
      data: { emailVerifiedAt: new Date() }
    });
    const otherOrgDocument = await createDocument(ctx.prisma, {
      ownerId: otherOrgUser.id,
      organizationId: otherOrgUser.organizationId,
      status: 'submitted',
      originalFilename: 'authz-other-org.pdf'
    });
    const otherOrgClaim = await ctx.prisma.claim.create({
      data: {
        documentId: otherOrgDocument.id,
        consumerId: otherOrgUser.id,
        organizationId: otherOrgUser.organizationId,
        status: 'submitted',
        purpose: 'expense',
        note: null,
        submittedAt: new Date()
      }
    });
    const otherOrgReview = await ctx.prisma.review.create({
      data: {
        documentId: otherOrgDocument.id,
        claimId: otherOrgClaim.id,
        status: 'pending',
        reviewerId: null,
        decisionNote: null
      }
    });
    const otherOrgMember = await request(ctx.app.getHttpServer())
      .post('/enterprise/members')
      .use(auth(otherOrgSession))
      .send({
        email: `other-org-member-${Date.now()}@balance.local`,
        password: 'valid local passphrase 1',
        displayName: 'Other Org Member',
        role: 'staff'
      })
      .expect(201);

    await request(ctx.app.getHttpServer()).get(`/enterprise/documents/${otherOrgDocument.id}`).use(auth(orgAdmin.session)).expect(403);
    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${otherOrgMember.body.member.id}`)
      .use(auth(orgAdmin.session))
      .send({ displayName: 'Wrong Org Edit' })
      .expect(404);
    await request(ctx.app.getHttpServer()).get(`/reviews/${otherOrgReview.id}`).use(auth(orgAdmin.session)).expect(403);
    await request(ctx.app.getHttpServer()).get(`/reviews/${otherReview.id}`).use(auth(systemAdmin.session)).expect(200);
  });
});
