import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SECURITY_AUDIT_ACTIONS } from '../src/audit/audit-event.constants';
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

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

describe.sequential('upload and storage access security', () => {
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

  it('accepts supported files from detected magic bytes instead of client MIME metadata', async () => {
    const consumer = await login(ctx.app, 'consumer');

    await request(ctx.app.getHttpServer())
      .post('/documents')
      .use(auth(consumer.session))
      .field('label', 'PNG receipt')
      .field('category', 'travel')
      .attach('file', png1x1, {
        filename: 'receipt.png',
        contentType: 'application/octet-stream'
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.document.contentType).toBe('image/png');
        expect(response.body.document.originalFilename).toBe('receipt.png');
        expect(JSON.stringify(response.body)).not.toContain('storageKey');
        expect(JSON.stringify(response.body)).not.toContain('documents/');
      });
  });

  it('rejects files whose declared type is supported but body is not a supported document', async () => {
    const consumer = await login(ctx.app, 'consumer');

    await request(ctx.app.getHttpServer())
      .post('/documents')
      .use(auth(consumer.session))
      .field('label', 'Spoofed receipt')
      .field('category', 'travel')
      .attach('file', Buffer.from('<html><body>not a receipt</body></html>'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf'
      })
      .expect(415)
      .expect((response) => {
        expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      });

    const rejected = await ctx.prisma.auditEvent.findFirstOrThrow({
      where: { action: SECURITY_AUDIT_ACTIONS.uploadRejected, entityId: consumer.user.id },
      orderBy: { createdAt: 'desc' }
    });
    expect(rejected.metadata).toEqual({});
    expect(JSON.stringify(rejected)).not.toContain('receipt.pdf');
    expect(JSON.stringify(rejected)).not.toContain('not a receipt');
  });

  it('rejects supported file bodies when the filename extension is not allowed', async () => {
    const consumer = await login(ctx.app, 'consumer');

    await request(ctx.app.getHttpServer())
      .post('/documents')
      .use(auth(consumer.session))
      .field('label', 'Bad extension')
      .field('category', 'travel')
      .attach('file', png1x1, {
        filename: 'receipt.svg',
        contentType: 'image/png'
      })
      .expect(415)
      .expect((response) => {
        expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      });
  });

  it('serves previews through authorization with non-shared cache headers', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const otherRegistered = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `upload-storage-other-${Date.now()}@balance.local`,
        password: 'valid local passphrase 1',
        displayName: 'Upload Storage Other'
      })
      .expect(201);
    const otherSession = sessionFromResponse(otherRegistered);
    const otherUser = otherRegistered.body.user as { id: string };

    const ownDocument = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      originalFilename: 'own-preview.pdf'
    });
    const foreignDocument = await createDocument(ctx.prisma, {
      ownerId: otherUser.id,
      status: 'extracted',
      originalFilename: 'foreign-preview.pdf'
    });

    await request(ctx.app.getHttpServer())
      .get(`/documents/${ownDocument.id}/preview`)
      .use(auth(consumer.session))
      .expect(200)
      .expect((response) => {
        expect(response.headers['cache-control']).toContain('private');
        expect(response.headers['cache-control']).toContain('no-store');
      });

    await request(ctx.app.getHttpServer())
      .get(`/documents/${foreignDocument.id}/preview`)
      .use(auth(consumer.session))
      .expect(404);

    await request(ctx.app.getHttpServer())
      .get(`/documents/${foreignDocument.id}/preview`)
      .use(auth(otherSession))
      .expect(200);

    const previews = await ctx.prisma.auditEvent.findMany({
      where: { action: SECURITY_AUDIT_ACTIONS.documentPreviewed },
      orderBy: { createdAt: 'asc' }
    });
    expect(previews.map((event) => event.entityId)).toEqual([ownDocument.id, foreignDocument.id]);
    expect(previews.every((event) => JSON.stringify(event.metadata) === '{}')).toBe(true);
  });
});
