import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SECURITY_AUDIT_ACTIONS } from '../src/audit/audit-event.constants';
import { QUEUE_ABUSE_LIMITS } from '../src/rate-limit/queue-abuse-limits';

import {
  auth,
  closeTestContext,
  createDocument,
  createTestContext,
  ensureSeedUsers,
  login,
  resetWorkflowData,
  type TestContext
} from './helpers/backend-app';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

describe.sequential('queue abuse controls', () => {
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

  it('blocks extraction retry abuse for one document inside the hourly window', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const document = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      originalFilename: 'retry-abuse.pdf'
    });

    await ctx.prisma.extractionJob.createMany({
      data: Array.from({ length: QUEUE_ABUSE_LIMITS.maxExtractionRetriesPerDocumentPerHour }, () => ({
        documentId: document.id,
        status: 'failed',
        provider: 'paddleocr',
        pipelineVersion: 'test'
      }))
    });

    await request(ctx.app.getHttpServer())
      .post(`/documents/${document.id}/extraction/retry`)
      .use(auth(consumer.session))
      .send({})
      .expect(429)
      .expect((response) => {
        expect(response.body.error.code).toBe('RATE_LIMITED');
      });

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { action: SECURITY_AUDIT_ACTIONS.rateLimitTriggered, entityType: 'security_event', entityId: document.id }
    });
    expect(audit?.metadata).toMatchObject({ policy: 'maxExtractionRetriesPerDocumentPerHour' });
  });

  it('audits an in-scope extraction retry state conflict without accepting a foreign object identifier', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const document = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'processing',
      originalFilename: 'processing-retry.pdf'
    });

    await request(ctx.app.getHttpServer())
      .post(`/documents/${document.id}/extraction/retry`)
      .use(auth(consumer.session))
      .send({})
      .expect(409);

    const audit = await ctx.prisma.auditEvent.findFirstOrThrow({
      where: { action: SECURITY_AUDIT_ACTIONS.extractionRetryDenied, entityId: document.id },
      orderBy: { createdAt: 'desc' }
    });
    expect(audit.metadata).toEqual({ reason: 'extraction_in_progress' });
  });

  it('blocks new upload enqueue when the user already has too many queued extraction jobs', async () => {
    const consumer = await login(ctx.app, 'consumer');

    for (let index = 0; index < QUEUE_ABUSE_LIMITS.maxQueuedExtractionJobsPerUser; index += 1) {
      const document = await createDocument(ctx.prisma, {
        ownerId: consumer.user.id,
        status: 'queued',
        originalFilename: `queued-${index}.pdf`
      });
      await ctx.prisma.extractionJob.create({
        data: {
          documentId: document.id,
          status: 'queued',
          provider: 'paddleocr',
          pipelineVersion: 'test'
        }
      });
    }

    await request(ctx.app.getHttpServer())
      .post('/documents')
      .use(auth(consumer.session))
      .field('label', 'Queue overflow')
      .field('category', 'travel')
      .attach('file', png1x1, {
        filename: 'overflow.png',
        contentType: 'image/png'
      })
      .expect(429)
      .expect((response) => {
        expect(response.body.error.code).toBe('RATE_LIMITED');
      });

    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { action: SECURITY_AUDIT_ACTIONS.rateLimitTriggered, entityType: 'security_event', entityId: consumer.user.id }
    });
    expect(audit?.metadata).toMatchObject({ policy: 'maxQueuedExtractionJobsPerUser' });
  });
});
