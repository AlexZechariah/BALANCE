import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describe.sequential('Balance API backend workflow', () => {
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

  it('proves login, me, missing auth, and role checks', async () => {
    await request(ctx.app.getHttpServer())
      .get('/ready')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ready');
      });

    const consumer = await login(ctx.app, 'consumer');
    expect(consumer.response.status).toBe(200);
    expect(consumer.response.body.user.role).toBe('consumer');
    expect(consumer.token).toEqual(expect.any(String));

    await request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.user.email).toBe('consumer@balance.local');
      });

    await request(ctx.app.getHttpServer()).get('/auth/me').expect(401);

    await request(ctx.app.getHttpServer())
      .get('/reviews/queue')
      .set('Authorization', auth(consumer.token))
      .expect(403);

    const reviewer = await login(ctx.app, 'reviewer');
    await request(ctx.app.getHttpServer())
      .post('/documents')
      .set('Authorization', auth(reviewer.token))
      .expect(403);

    const otherDocument = await createDocument(ctx.prisma, {
      ownerId: reviewer.user.id,
      status: 'extracted'
    });

    await request(ctx.app.getHttpServer())
      .get(`/documents/${otherDocument.id}`)
      .set('Authorization', auth(consumer.token))
      .expect(404);
  });

  it('proves enterprise registration does not share organizations by name', async () => {
    const suffix = Date.now().toString(36);
    const orgName = `Acme ${suffix}`;

    const registered = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `owner-${suffix}@balance.local`,
        password: 'ValidPass1!',
        displayName: 'Acme Owner',
        orgName
      })
      .expect(201);

    expect(registered.body.user.role).toBe('admin');
    expect(registered.body.user.organizationId).toEqual(expect.any(String));

    await request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', auth(registered.body.accessToken))
      .expect(200)
      .expect((response) => {
        expect(response.body.user.organizationId).toBe(registered.body.user.organizationId);
      });

    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `other-${suffix}@balance.local`,
        password: 'ValidPass1!',
        displayName: 'Other Owner',
        orgName
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe('ORG_NAME_EXISTS');
      });
  });

  it('proves account settings require current password for sensitive changes', async () => {
    const suffix = Date.now().toString(36);
    const initialEmail = `consumer-settings-${suffix}@balance.local`;
    const updatedEmail = `consumer-settings-updated-${suffix}@balance.local`;

    const registered = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: initialEmail,
        password: 'ValidPass1!',
        displayName: 'Settings User'
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', auth(registered.body.accessToken))
      .send({ displayName: 'Updated Settings User' })
      .expect(200)
      .expect((response) => {
        expect(response.body.user.displayName).toBe('Updated Settings User');
        expect(response.body.user.email).toBe(initialEmail);
      });

    await request(ctx.app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', auth(registered.body.accessToken))
      .send({ email: updatedEmail })
      .expect(422);

    await request(ctx.app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', auth(registered.body.accessToken))
      .send({ email: updatedEmail, currentPassword: 'WrongPass1!' })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', auth(registered.body.accessToken))
      .send({ email: updatedEmail, currentPassword: 'ValidPass1!', newPassword: 'NextPass1!' })
      .expect(200)
      .expect((response) => {
        expect(response.body.user.email).toBe(updatedEmail);
      });

    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: updatedEmail, password: 'ValidPass1!' })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: updatedEmail, password: 'NextPass1!' })
      .expect(200);
  });

  it('proves enterprise member and global admin boundaries', async () => {
    const orgAdmin = await login(ctx.app, 'orgAdmin');
    const systemAdmin = await login(ctx.app, 'admin');

    await request(ctx.app.getHttpServer())
      .post('/enterprise/members')
      .set('Authorization', auth(orgAdmin.token))
      .send({
        email: `weak-${Date.now()}@balance.local`,
        password: 'password',
        displayName: 'Weak Password'
      })
      .expect(422);

    // Cannot demote the last admin (including yourself).
    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${orgAdmin.user.id}/role`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ role: 'staff' })
      .expect(409);

    const staffEmail = `staff-${Date.now()}@balance.local`;
    const created = await request(ctx.app.getHttpServer())
      .post('/enterprise/members')
      .set('Authorization', auth(orgAdmin.token))
      .send({
        email: staffEmail,
        password: 'ValidPass1!',
        displayName: 'Team Staff',
        role: 'staff'
      })
      .expect(201);

    expect(created.body.member).toMatchObject({
      email: staffEmail,
      role: 'staff',
      organizationId: orgAdmin.user.organizationId
    });

    const adminEmail = `admin-${Date.now()}@balance.local`;
    const createdAdmin = await request(ctx.app.getHttpServer())
      .post('/enterprise/members')
      .set('Authorization', auth(orgAdmin.token))
      .send({
        email: adminEmail,
        password: 'ValidPass1!',
        displayName: 'Team Admin',
        role: 'admin'
      })
      .expect(201);

    expect(createdAdmin.body.member).toMatchObject({
      email: adminEmail,
      role: 'admin',
      organizationId: orgAdmin.user.organizationId
    });

    await request(ctx.app.getHttpServer())
      .get('/enterprise/members')
      .set('Authorization', auth(orgAdmin.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.members.some((member: { email: string }) => member.email === staffEmail)).toBe(true);
      });

    const editedStaffEmail = `edited-${staffEmail}`;
    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${created.body.member.id}`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ displayName: 'Updated Team Staff', email: editedStaffEmail, role: 'reviewer' })
      .expect(200)
      .expect((response) => {
        expect(response.body.member).toMatchObject({
          displayName: 'Updated Team Staff',
          email: editedStaffEmail,
          role: 'reviewer',
          organizationId: orgAdmin.user.organizationId
        });
      });

    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${created.body.member.id}/password`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ password: 'ResetPass1!' })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: editedStaffEmail, password: 'ValidPass1!' })
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: editedStaffEmail, password: 'ResetPass1!' })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${orgAdmin.user.id}/password`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ password: 'ResetPass1!' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .delete(`/enterprise/members/${orgAdmin.user.id}`)
      .set('Authorization', auth(orgAdmin.token))
      .expect(403);

    // Role updates: promote/demote with "last admin" guard.
    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${created.body.member.id}/role`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ role: 'admin' })
      .expect(200)
      .expect((response) => {
        expect(response.body.member.role).toBe('admin');
      });

    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${created.body.member.id}/role`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ role: 'staff' })
      .expect(200)
      .expect((response) => {
        expect(response.body.member.role).toBe('staff');
      });

    // Demoting a non-last admin is allowed.
    await request(ctx.app.getHttpServer())
      .patch(`/enterprise/members/${createdAdmin.body.member.id}/role`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ role: 'staff' })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get('/audit/summary')
      .set('Authorization', auth(orgAdmin.token))
      .expect(200)
      .expect((res) => {
        expect(res.body.summary).toBeDefined();
        expect(typeof res.body.summary.total).toBe('number');
      });

    await request(ctx.app.getHttpServer())
      .get('/audit/summary')
      .set('Authorization', auth(systemAdmin.token))
      .expect(200);

    await request(ctx.app.getHttpServer())
      .delete('/documents')
      .set('Authorization', auth(orgAdmin.token))
      .expect(403);
  });

  it('proves enterprise staff cannot access review queue endpoints (admin-only)', async () => {
    const staff = await login(ctx.app, 'staff');
    const orgAdmin = await login(ctx.app, 'orgAdmin');
    const suffix = Date.now().toString(36);

    const upload = await request(ctx.app.getHttpServer())
      .post('/documents')
      .set('Authorization', auth(staff.token))
      .field('label', 'Staff review receipt')
      .field('category', 'software')
      .attach('file', Buffer.from('%PDF-1.4\n% Balance staff test\n'), {
        filename: `staff-${suffix}.pdf`,
        contentType: 'application/pdf'
      })
      .expect(201);

    const uploadedDocumentId = upload.body.document.id as string;
    const storedDocument = await ctx.prisma.document.findUniqueOrThrow({ where: { id: uploadedDocumentId } });
    expect(storedDocument.organizationId).toBe(staff.user.organizationId);

    const claimableDocument = await createDocument(ctx.prisma, {
      ownerId: staff.user.id,
      organizationId: staff.user.organizationId,
      status: 'extracted',
      originalFilename: `staff-claim-${suffix}.pdf`,
      merchantName: 'Staff Merchant'
    });

    const documentId = claimableDocument.id;

    const claim = await request(ctx.app.getHttpServer())
      .post('/claims')
      .set('Authorization', auth(staff.token))
      .send({ documentId, purpose: 'Reimbursement', note: 'Team meal' })
      .expect(201);

    const reviewId = claim.body.review.id as string;
    const submittedAudit = await ctx.prisma.auditEvent.findFirst({
      where: { action: 'claim.submitted', reviewId }
    });
    expect(submittedAudit?.actorRole).toBe('staff');
    expect(submittedAudit?.organizationId).toBe(staff.user.organizationId);

    await request(ctx.app.getHttpServer())
      .get('/reviews/queue')
      .set('Authorization', auth(staff.token))
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/reviews/${reviewId}`)
      .set('Authorization', auth(staff.token))
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/approve`)
      .set('Authorization', auth(staff.token))
      .send({ note: 'Staff should not decide' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/claim`)
      .set('Authorization', auth(orgAdmin.token))
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/approve`)
      .set('Authorization', auth(orgAdmin.token))
      .send({ note: 'Org admin approved' })
      .expect(200);

    const otherOrg = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `other-admin-${suffix}@balance.local`,
        password: 'ValidPass1!',
        displayName: 'Other Admin',
        orgName: `Other Org ${suffix}`
      })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .get(`/reviews/${reviewId}`)
      .set('Authorization', auth(otherOrg.body.accessToken))
      .expect(403);

    const otherOrgDocument = await createDocument(ctx.prisma, {
      ownerId: otherOrg.body.user.id,
      organizationId: otherOrg.body.user.organizationId,
      status: 'extracted',
      originalFilename: `other-org-${suffix}.pdf`
    });

    await ctx.prisma.auditEvent.create({
      data: {
        action: 'document.uploaded',
        entityType: 'document',
        entityId: otherOrgDocument.id,
        actorId: otherOrg.body.user.id,
        actorRole: 'admin',
        organizationId: otherOrg.body.user.organizationId,
        documentId: otherOrgDocument.id,
        message: 'Other organization document uploaded',
        metadata: {}
      }
    });

    const orgSummary = await request(ctx.app.getHttpServer())
      .get('/audit/summary')
      .set('Authorization', auth(orgAdmin.token))
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get('/audit')
      .set('Authorization', auth(orgAdmin.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.page.total).toBe(orgSummary.body.summary.total);
        expect(response.body.auditEvents.some((event: { entityId: string }) => event.entityId === otherOrgDocument.id)).toBe(false);
      });
  });

  it('proves enterprise recall flow (submitted -> draft -> resubmit) and org-wide admin lists', async () => {
    const staff = await login(ctx.app, 'staff');
    const orgAdmin = await login(ctx.app, 'orgAdmin');

    const doc = await createDocument(ctx.prisma, {
      ownerId: staff.user.id,
      organizationId: staff.user.organizationId,
      status: 'extracted'
    });

    const submitted = await request(ctx.app.getHttpServer())
      .post('/claims')
      .set('Authorization', auth(staff.token))
      .send({ documentId: doc.id, purpose: 'Reimbursement', note: 'First pass' })
      .expect(201);

    const claimId = submitted.body.claim.id as string;
    const reviewId = submitted.body.review.id as string;

    await request(ctx.app.getHttpServer())
      .get('/enterprise/claims')
      .set('Authorization', auth(orgAdmin.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.claims.some((c: { id: string }) => c.id === claimId)).toBe(true);
      });

    // Recall is allowed only while review is pending and unclaimed.
    await request(ctx.app.getHttpServer())
      .post(`/claims/${claimId}/recall`)
      .set('Authorization', auth(staff.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.claim.status).toBe('draft');
        expect(response.body.document.id).toBe(doc.id);
      });

    const recalledAudit = await ctx.prisma.auditEvent.findFirst({
      where: { action: 'claim.recalled', claimId }
    });
    expect(recalledAudit?.actorRole).toBe('staff');

    const reviewAfterRecall = await ctx.prisma.review.findUnique({ where: { id: reviewId } });
    expect(reviewAfterRecall).toBeNull();

    // Resubmit updates the existing draft claim and creates a new review.
    const resubmitted = await request(ctx.app.getHttpServer())
      .post('/claims')
      .set('Authorization', auth(staff.token))
      .send({ documentId: doc.id, purpose: 'Reimbursement', note: 'Second pass' })
      .expect(201);

    expect(resubmitted.body.claim.id).toBe(claimId);
    expect(resubmitted.body.claim.status).toBe('submitted');
    expect(resubmitted.body.review.status).toBe('pending');

    const resubmittedAudit = await ctx.prisma.auditEvent.findFirst({
      where: { action: 'claim.resubmitted', claimId }
    });
    expect(resubmittedAudit?.actorRole).toBe('staff');

    // Org admin can see the resubmitted claim in org-wide list.
    await request(ctx.app.getHttpServer())
      .get('/enterprise/claims')
      .set('Authorization', auth(orgAdmin.token))
      .expect(200)
      .expect((response) => {
        const match = response.body.claims.find((c: { id: string }) => c.id === claimId);
        expect(match).toBeTruthy();
        expect(match.consumer.email).toBe(staff.user.email);
      });
  });

  it('proves document upload, metadata, list, detail, queue job, and correction state rules', async () => {
    const consumer = await login(ctx.app, 'consumer');

    const upload = await request(ctx.app.getHttpServer())
      .post('/documents')
      .set('Authorization', auth(consumer.token))
      .field('label', 'Travel receipt')
      .field('notes', 'Taxi from airport')
      .field('documentType', 'tax')
      .field('category', 'travel')
      .attach('file', Buffer.from('%PDF-1.4\n% Balance test file\n'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf'
      })
      .expect(201);

    expect(upload.body.document).toMatchObject({
      ownerId: consumer.user.id,
      originalFilename: 'receipt.pdf',
      contentType: 'application/pdf',
      status: 'queued',
      label: 'Travel receipt',
      notes: 'Taxi from airport',
      category: 'travel',
      documentType: 'tax'
    });
    expect(upload.body.extractionJob).toMatchObject({
      documentId: upload.body.document.id,
      status: 'queued',
      provider: 'paddleocr'
    });

    const queuedJob = await ctx.prisma.extractionJob.findFirst({
      where: { documentId: upload.body.document.id }
    });
    expect(queuedJob?.status).toBe('queued');

    await request(ctx.app.getHttpServer())
      .get('/documents')
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.documents[0]).toMatchObject({
          id: upload.body.document.id,
          label: 'Travel receipt',
          notes: 'Taxi from airport'
        });
      });

    await request(ctx.app.getHttpServer())
      .get(`/documents/${upload.body.document.id}`)
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.document).toMatchObject({
          id: upload.body.document.id,
          label: 'Travel receipt',
          notes: 'Taxi from airport'
        });
      });

    for (const status of ['extracted', 'correction_required'] as const) {
      const document = await createDocument(ctx.prisma, {
        ownerId: consumer.user.id,
        status
      });

      await request(ctx.app.getHttpServer())
        .patch(`/documents/${document.id}/corrections`)
        .set('Authorization', auth(consumer.token))
        .send({
          fields: [{ name: 'merchantName', correctedValue: 'Corrected Merchant' }]
        })
        .expect(200)
        .expect((response) => {
          expect(response.body.document.status).toBe('corrected');
        });
    }

    for (const status of ['uploaded', 'queued', 'processing', 'submitted', 'reviewed', 'rejected', 'failed'] as const) {
      const document = await createDocument(ctx.prisma, {
        ownerId: consumer.user.id,
        status
      });

      await request(ctx.app.getHttpServer())
        .patch(`/documents/${document.id}/corrections`)
        .set('Authorization', auth(consumer.token))
        .send({
          fields: [{ name: 'merchantName', correctedValue: 'Blocked Merchant' }]
        })
        .expect(409);
    }

    // Retry extraction: allowed pre-claim and when not queued/processing.
    const retryable = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'failed'
    });

    await request(ctx.app.getHttpServer())
      .post(`/documents/${retryable.id}/extraction/retry`)
      .set('Authorization', auth(consumer.token))
      .send({})
      .expect(201)
      .expect((response) => {
        expect(response.body.document.id).toBe(retryable.id);
        expect(response.body.document.status).toBe('queued');
        expect(response.body.extractionJob.status).toBe('queued');
        expect(response.body.extractionJob.provider).toBe('paddleocr');
      });

    // The extraction worker runs asynchronously and picks up BullMQ jobs
    // immediately. We do NOT re-query the extraction job status here because
    // the worker may have already transitioned it from queued → processing,
    // creating a race condition. The API response above (line 625-627) already
    // proved the job was created with status='queued' and provider='paddleocr'.
    // The document status check below is safe because the worker does not
    // change the document status until extraction fully completes.
    const updatedDoc = await ctx.prisma.document.findUniqueOrThrow({ where: { id: retryable.id } });
    expect(updatedDoc.status).toBe('queued');

    for (const status of ['queued', 'processing'] as const) {
      const blocked = await createDocument(ctx.prisma, {
        ownerId: consumer.user.id,
        status
      });

      await request(ctx.app.getHttpServer())
        .post(`/documents/${blocked.id}/extraction/retry`)
        .set('Authorization', auth(consumer.token))
        .send({})
        .expect(409);
    }

    const claimedDoc = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted'
    });
    await ctx.prisma.claim.create({
      data: {
        documentId: claimedDoc.id,
        consumerId: consumer.user.id,
        status: 'submitted',
        purpose: 'Test purpose',
        note: null,
        submittedAt: new Date()
      }
    });

    await request(ctx.app.getHttpServer())
      .post(`/documents/${claimedDoc.id}/extraction/retry`)
      .set('Authorization', auth(consumer.token))
      .send({})
      .expect(409);

    const deleteTarget = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted'
    });

    await ctx.prisma.auditEvent.create({
      data: {
        action: 'document.test_context',
        entityType: 'document',
        entityId: deleteTarget.id,
        actorRole: 'system',
        message: 'Pre-delete document audit context',
        documentId: deleteTarget.id
      }
    });

    await request(ctx.app.getHttpServer())
      .delete(`/documents/${deleteTarget.id}`)
      .set('Authorization', auth(consumer.token))
      .expect(204);

    const deletionAudit = await ctx.prisma.auditEvent.findFirstOrThrow({
      where: { action: 'document.deleted', entityId: deleteTarget.id }
    });
    expect(deletionAudit.documentId).toBeNull();
    expect(deletionAudit.metadata).toMatchObject({
      deletedDocumentId: deleteTarget.id,
      originalFilename: deleteTarget.originalFilename
    });
  });

  it('proves metadata patch accepts all system documentType values including invoice/receipt/receipt_pdf', async () => {
    const consumer = await login(ctx.app, 'consumer');

    // All values the worker and inferDocumentType can set, plus consumer record types
    const documentTypes = ['invoice', 'receipt', 'receipt_pdf', 'tax', 'warranty', 'return', 'personal', 'reimbursement'] as const;

    for (const documentType of documentTypes) {
      const doc = await createDocument(ctx.prisma, {
        ownerId: consumer.user.id,
        status: 'extracted',
        documentType,
      });

      const response = await request(ctx.app.getHttpServer())
        .patch(`/documents/${doc.id}/metadata`)
        .set('Authorization', auth(consumer.token))
        .send({ category: 'other', documentType })
        .expect(200);

      expect(response.body.document.documentType).toBe(documentType);
    }

    // Also verify that omitting documentType (undefined) works — this is the enterprise view path
    const nullDoc = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      documentType: 'invoice',
    });

    await request(ctx.app.getHttpServer())
      .patch(`/documents/${nullDoc.id}/metadata`)
      .set('Authorization', auth(consumer.token))
      .send({ category: 'other' })
      .expect(200);
  });

  it('proves consumer document and claim insights use the dashboard contract', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const previousDate = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-15`;

    const currentDoc = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      merchantName: 'Alpha Grocer',
      documentDate: currentDate,
      transactionDate: currentDate,
      amountMinor: 5000,
      currency: 'MYR',
      category: 'grocery',
      documentType: 'tax'
    });

    await ctx.prisma.documentField.createMany({
      data: [
        { documentId: currentDoc.id, name: 'tax', value: '3.00', source: 'ocr', confidence: 0.98 },
        { documentId: currentDoc.id, name: 'serviceCharge', value: '2.00', source: 'ocr', confidence: 0.97 },
        { documentId: currentDoc.id, name: 'discount', value: '1.00', source: 'ocr', confidence: 0.96 }
      ]
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'failed',
      merchantName: 'Alpha Grocer',
      documentDate: currentDate,
      transactionDate: currentDate,
      amountMinor: 1000,
      currency: 'MYR',
      category: 'grocery',
      documentType: 'warranty'
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      merchantName: 'Beta Cafe',
      documentDate: previousDate,
      transactionDate: previousDate,
      amountMinor: 2500,
      currency: 'MYR',
      category: 'restaurant',
      documentType: 'return'
    });

    await ctx.prisma.claim.create({
      data: {
        documentId: currentDoc.id,
        consumerId: consumer.user.id,
        status: 'submitted',
        purpose: 'Reimbursement',
        note: null,
        submittedAt: new Date()
      }
    });

    await request(ctx.app.getHttpServer())
      .get('/documents/insights')
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.insights).toMatchObject({
          currentMonthSpendMinor: 6000,
          previousMonthSpendMinor: 2500,
          currentMonthDocumentCount: 2,
          totalTaxMinor: 300,
          totalServiceChargeMinor: 200,
          totalDiscountMinor: 100,
          averageReceiptMinor: 3000,
          statusCounts: { extracted: 2, failed: 1 },
          claimCounts: { submitted: 1 },
          mostFrequentMerchant: { merchantName: 'Alpha Grocer', count: 2 },
          topMerchantBySpend: { merchantName: 'Alpha Grocer', amountMinor: 6000 }
        });
        expect(response.body.insights.monthOverMonthChange).toBeCloseTo(140);
        expect(response.body.insights.monthlySpend).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ month: previousDate.slice(0, 7), amountMinor: 2500, count: 1 }),
            expect.objectContaining({ month: currentDate.slice(0, 7), amountMinor: 6000, count: 2 })
          ])
        );
        expect(response.body.insights.merchantSpend[0]).toMatchObject({ merchantName: 'Alpha Grocer', amountMinor: 6000, count: 2 });
        expect(response.body.insights.categorySpend).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ category: 'grocery', amountMinor: 6000, count: 2 }),
            expect.objectContaining({ category: 'restaurant', amountMinor: 2500, count: 1 })
          ])
        );
        expect(response.body.insights.recordTypeSpend).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ recordType: 'tax', amountMinor: 5000, count: 1 }),
            expect.objectContaining({ recordType: 'warranty', amountMinor: 1000, count: 1 }),
            expect.objectContaining({ recordType: 'return', amountMinor: 2500, count: 1 })
          ])
        );
        expect(response.body.insights.lastUpdatedAt).toEqual(expect.any(String));
        expect(response.body.insights.recentDocuments).toHaveLength(3);
        expect(response.body.insights.recentClaims[0]).toMatchObject({
          documentId: currentDoc.id,
          status: 'submitted',
          amountMinor: 5000,
          merchantName: 'Alpha Grocer',
          currency: 'MYR'
        });
      });

    await request(ctx.app.getHttpServer())
      .get('/claims/insights')
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.insights).toMatchObject({
          totalClaims: 1,
          approvedAmountMinor: 0,
          pendingAmountMinor: 5000,
          rejectedAmountMinor: 0,
          statusCounts: { draft: 0, submitted: 1, under_review: 0, approved: 0, rejected: 0 }
        });
      });
  });

  it('proves consumer budgets are month-scoped, canonical-category, user-owned, and spend-backed', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const staff = await login(ctx.app, 'staff');
    const suffix = Date.now().toString(36);
    const budgetMonth = '2026-05';
    const currentDate = `${budgetMonth}-18`;
    const previousDate = '2026-04-18';

    const otherConsumer = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `budget-other-${suffix}@balance.local`,
        password: 'ValidPass1!',
        displayName: 'Budget Other'
      })
      .expect(201);

    const editedCategoryDocument = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 1450,
      currency: 'MYR',
      category: 'other'
    });

    await request(ctx.app.getHttpServer())
      .patch(`/documents/${editedCategoryDocument.id}/metadata`)
      .set('Authorization', auth(consumer.token))
      .send({ category: 'Restaurant' })
      .expect(200)
      .expect((response) => {
        expect(response.body.document.category).toBe('restaurant');
      });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 4000,
      currency: 'MYR',
      category: 'Restaurant'
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 2000,
      currency: 'MYR',
      category: ' restaurant '
    });

    const fallbackAmountDocument = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: null,
      currency: 'MYR',
      category: 'RESTaurant'
    });
    await ctx.prisma.documentField.create({
      data: {
        documentId: fallbackAmountDocument.id,
        name: 'total',
        value: 'RM 15.50',
        source: 'ocr'
      }
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: previousDate,
      documentDate: previousDate,
      amountMinor: 9000,
      currency: 'MYR',
      category: 'restaurant'
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 1200,
      currency: 'MYR',
      category: 'grocery'
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 700,
      currency: 'MYR',
      category: null
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 500,
      currency: 'MYR',
      category: 'Food And Beverage'
    });

    await request(ctx.app.getHttpServer())
      .get('/budgets')
      .set('Authorization', auth(staff.token))
      .expect(403);

    const created = await request(ctx.app.getHttpServer())
      .post('/budgets')
      .set('Authorization', auth(consumer.token))
      .send({ category: 'Restaurant', amountMinor: 10000, month: budgetMonth, currency: 'MYR' })
      .expect(201);

    expect(created.body.budget).toMatchObject({
      userId: consumer.user.id,
      category: 'restaurant',
      month: budgetMonth,
      amountMinor: 10000,
      actualMinor: 9000,
      remainingMinor: 1000,
      documentCount: 4,
      isOverBudget: false
    });

    const softwareBudget = await request(ctx.app.getHttpServer())
      .post('/budgets')
      .set('Authorization', auth(consumer.token))
      .send({ category: 'software', amountMinor: 3000, month: budgetMonth })
      .expect(201);
    expect(softwareBudget.body.budget).toMatchObject({
      category: 'software',
      actualMinor: 0,
      documentCount: 0,
      remainingMinor: 3000
    });

    await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted',
      transactionDate: currentDate,
      documentDate: currentDate,
      amountMinor: 2500,
      currency: 'MYR',
      category: 'software'
    });

    await request(ctx.app.getHttpServer())
      .post('/budgets')
      .set('Authorization', auth(consumer.token))
      .send({ category: 'RESTAURANT', amountMinor: 8000, month: budgetMonth })
      .expect(409);

    await request(ctx.app.getHttpServer())
      .get(`/budgets?month=${budgetMonth}`)
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.month).toBe(budgetMonth);
        expect(response.body.budgets).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ category: 'restaurant', actualMinor: 9000, documentCount: 4 }),
            expect.objectContaining({ category: 'software', actualMinor: 2500, documentCount: 1 })
          ])
        );
        expect(response.body.unbudgetedCategories).toEqual([
          expect.objectContaining({ category: 'grocery', amountMinor: 1200, count: 1 }),
          expect.objectContaining({ category: 'uncategorized', amountMinor: 700, count: 1 }),
          expect.objectContaining({ category: 'other', amountMinor: 500, count: 1 })
        ]);
      });

    await request(ctx.app.getHttpServer())
      .get('/budgets?month=2026-04')
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.budgets).toHaveLength(0);
        expect(response.body.unbudgetedCategories).toEqual([
          expect.objectContaining({ category: 'restaurant', amountMinor: 9000, count: 1 })
        ]);
      });

    await request(ctx.app.getHttpServer())
      .patch(`/budgets/${created.body.budget.id}`)
      .set('Authorization', auth(otherConsumer.body.accessToken))
      .send({ amountMinor: 5000 })
      .expect(404);

    await request(ctx.app.getHttpServer())
      .patch(`/budgets/${created.body.budget.id}`)
      .set('Authorization', auth(consumer.token))
      .send({ amountMinor: 8000 })
      .expect(200)
      .expect((response) => {
        expect(response.body.budget).toMatchObject({
          amountMinor: 8000,
          actualMinor: 9000,
          remainingMinor: -1000,
          isOverBudget: true
        });
      });

    await request(ctx.app.getHttpServer())
      .delete(`/budgets/${created.body.budget.id}`)
      .set('Authorization', auth(otherConsumer.body.accessToken))
      .expect(404);

    await request(ctx.app.getHttpServer())
      .delete(`/budgets/${created.body.budget.id}`)
      .set('Authorization', auth(consumer.token))
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/budgets?month=${budgetMonth}`)
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.budgets).toHaveLength(1);
        expect(response.body.budgets[0]).toMatchObject({ category: 'software', actualMinor: 2500 });
        expect(response.body.unbudgetedCategories).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ category: 'restaurant', amountMinor: 9000, count: 4 })
          ])
        );
      });

    const budgetActions = await ctx.prisma.auditEvent.findMany({
      where: { entityType: 'budget', actorId: consumer.user.id },
      orderBy: { createdAt: 'asc' }
    });
    expect(budgetActions.map((event) => event.action)).toEqual(['budget.created', 'budget.created', 'budget.updated', 'budget.deleted']);
  });

  it('proves claim, review, explicit claim transition, decision, and audit behavior', async () => {
    const consumer = await login(ctx.app, 'consumer');
    const reviewer = await login(ctx.app, 'reviewer');
    const reviewer2 = await login(ctx.app, 'reviewer2');
    const admin = await login(ctx.app, 'admin');

    const document = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted'
    });

    const claimResponse = await request(ctx.app.getHttpServer())
      .post('/claims')
      .set('Authorization', auth(consumer.token))
      .send({
        documentId: document.id,
        purpose: 'Reimbursement',
        note: 'Please review'
      })
      .expect(201);

    const claimId = claimResponse.body.claim.id as string;
    const reviewId = claimResponse.body.review.id as string;
    expect(claimResponse.body.claim.status).toBe('submitted');
    expect(claimResponse.body.review.status).toBe('pending');

    await request(ctx.app.getHttpServer())
      .get('/claims')
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.claims.some((claim: { id: string }) => claim.id === claimId)).toBe(true);
      });

    await request(ctx.app.getHttpServer())
      .get(`/claims/${claimId}`)
      .set('Authorization', auth(consumer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.claim.review.id).toBe(reviewId);
      });

    await request(ctx.app.getHttpServer())
      .get('/reviews/queue')
      .set('Authorization', auth(reviewer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.reviews.some((review: { id: string }) => review.id === reviewId)).toBe(true);
      });

    await request(ctx.app.getHttpServer())
      .get(`/reviews/${reviewId}`)
      .set('Authorization', auth(reviewer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.review.status).toBe('pending');
      });

    const afterRead = await ctx.prisma.review.findUniqueOrThrow({
      where: { id: reviewId },
      include: { claim: true }
    });
    expect(afterRead.status).toBe('pending');
    expect(afterRead.claim.status).toBe('submitted');

    await request(ctx.app.getHttpServer())
      .get(`/reviews/${reviewId}`)
      .set('Authorization', auth(reviewer2.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.review.status).toBe('pending');
      });

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/approve`)
      .set('Authorization', auth(reviewer.token))
      .send({ note: 'Skipping claim should fail' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/reject`)
      .set('Authorization', auth(reviewer.token))
      .send({ note: 'Skipping claim should fail' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/claim`)
      .set('Authorization', auth(reviewer.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.review.status).toBe('in_review');
        expect(response.body.review.reviewerId).toBe(reviewer.user.id);
        expect(response.body.claim.status).toBe('under_review');
      });

    const startedAudit = await ctx.prisma.auditEvent.findFirst({
      where: { action: 'review.started', reviewId }
    });
    expect(startedAudit?.actorId).toBe(reviewer.user.id);
    expect(startedAudit?.actorRole).toBe('reviewer');

    await request(ctx.app.getHttpServer())
      .get(`/reviews/${reviewId}`)
      .set('Authorization', auth(reviewer2.token))
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/documents/${document.id}`)
      .set('Authorization', auth(reviewer2.token))
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/claims/${claimId}`)
      .set('Authorization', auth(reviewer2.token))
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/audit?reviewId=${reviewId}`)
      .set('Authorization', auth(reviewer2.token))
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/approve`)
      .set('Authorization', auth(reviewer2.token))
      .send({ note: 'Wrong reviewer should fail' })
      .expect(403);

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/approve`)
      .set('Authorization', auth(admin.token))
      .send({ note: 'Looks correct' })
      .expect(200)
      .expect((response) => {
        expect(response.body.review.status).toBe('approved');
        expect(response.body.claim.status).toBe('approved');
        expect(response.body.document.status).toBe('reviewed');
      });

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${reviewId}/claim`)
      .set('Authorization', auth(reviewer.token))
      .expect(409);

    const rejectDocument = await createDocument(ctx.prisma, {
      ownerId: consumer.user.id,
      status: 'extracted'
    });

    const rejectClaim = await request(ctx.app.getHttpServer())
      .post('/claims')
      .set('Authorization', auth(consumer.token))
      .send({ documentId: rejectDocument.id, purpose: 'Warranty' })
      .expect(201);

    const rejectReviewId = rejectClaim.body.review.id as string;
    await request(ctx.app.getHttpServer())
      .post(`/reviews/${rejectReviewId}/claim`)
      .set('Authorization', auth(reviewer.token))
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/reviews/${rejectReviewId}`)
      .set('Authorization', auth(admin.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.review.reviewerId).toBe(reviewer.user.id);
      });

    await request(ctx.app.getHttpServer())
      .post(`/reviews/${rejectReviewId}/reject`)
      .set('Authorization', auth(admin.token))
      .send({ note: 'Missing merchant details' })
      .expect(200)
      .expect((response) => {
        expect(response.body.review.status).toBe('rejected');
        expect(response.body.review.reviewerId).toBe(reviewer.user.id);
        expect(response.body.claim.status).toBe('rejected');
        expect(response.body.document.status).toBe('rejected');
      });

    await request(ctx.app.getHttpServer())
      .get('/audit')
      .set('Authorization', auth(admin.token))
      .expect(200)
      .expect((response) => {
        expect(response.body.auditEvents.length).toBeGreaterThan(0);
      });

    await request(ctx.app.getHttpServer())
      .get('/audit')
      .set('Authorization', auth(consumer.token))
      .expect(422);
  });
});
