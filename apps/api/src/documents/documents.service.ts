import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentField,
  DocumentStatus,
  ExtractionProvider,
  ExtractionJobStatus,
  FieldName,
  FieldSource,
  Prisma
} from '@balance/db';

import { throwContractHttpError, throwValidationError } from '../common/contract-errors';
import { ExtractionService } from '../extraction/extraction.service';
import { ExtractionProviderValidationError } from '../extraction/extraction.validation';
import { PrismaService } from '../prisma/prisma.service';
import { ScopedPrismaService } from '../prisma/scoped-prisma.service';
import { ExtractionQueueService } from '../queue/extraction-queue.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { AuditService } from '../audit/audit.service';
import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { isSystemAdminRole } from '../auth/access-policy';
import { QUEUE_ABUSE_LIMITS } from '../rate-limit/queue-abuse-limits';

import {
  amountLikeToMinor,
  effectiveDocumentAmountMinor,
  effectiveDocumentCategory,
  effectiveDocumentMonth,
  fieldValue
} from './document-spend';
import { UploadSecurityService } from './upload-security.service';

function fieldLabel(name: FieldName): string {
  const labels: Record<string, string> = {
    'merchantName': 'Merchant name',
    'documentDate': 'Document date',
    'amountMinor': 'Amount',
    'currency': 'Currency',
    'vendorAddress': 'Vendor address',
    'vendorPhone': 'Vendor phone',
    'vendorTaxId': 'Vendor tax ID',
    'merchantLegalName': 'Merchant legal name',
    'merchantUrl': 'Merchant URL',
    'invoiceReceiptId': 'Invoice/Receipt #',
    'receiptId': 'Receipt #',
    'invoiceId': 'Invoice #',
    'orderId': 'Order #',
    'receiverName': 'Receiver name',
    'receiverAddress': 'Receiver address',
    'customerName': 'Customer name',
    'customerAddress': 'Customer address',
    'customerEmail': 'Customer email',
    'customerPhone': 'Customer phone',
    'customerTaxId': 'Customer tax ID',
    'dueDate': 'Due date',
    'orderDate': 'Order date',
    'invoiceDate': 'Invoice date',
    'deliveryDate': 'Delivery date',
    'transactionTime': 'Transaction time',
    'total': 'Total',
    'subtotal': 'Subtotal',
    'tax': 'Tax',
    'taxRate': 'Tax rate',
    'taxableAmount': 'Taxable amount',
    'amountDue': 'Amount due',
    'amountPaid': 'Amount paid',
    'discount': 'Discount',
    'voucher': 'Voucher',
    'shippingCharge': 'Shipping charge',
    'serviceCharge': 'Service charge',
    'gratuity': 'Gratuity',
    'roundingAdjustment': 'Rounding adjustment',
    'paymentType': 'Payment type',
    'paymentCardLast4': 'Card last 4',
    'paymentReference': 'Payment reference',
    'paymentTerms': 'Payment terms',
    'poNumber': 'PO number',
    'cashierName': 'Cashier',
    'serverName': 'Server',
    'tableNumber': 'Table',
    'coverCount': 'Covers',
    'supplierName': 'Supplier name',
    'supplierEmail': 'Supplier email',
    'supplierPhone': 'Supplier phone',
    'supplierWebsite': 'Supplier website',
    'supplierTaxId': 'Supplier tax ID',
    'supplierRegistration': 'Supplier registration',
    'remittanceAddress': 'Remittance address',
    'bankAccount': 'Bank account',
    'vendorStreet': 'Vendor street',
    'vendorCity': 'Vendor city',
    'vendorState': 'Vendor state',
    'vendorCountry': 'Vendor country',
    'vendorPostalCode': 'Vendor postal code',
    'receiverStreet': 'Receiver street',
    'receiverCity': 'Receiver city',
    'receiverState': 'Receiver state',
    'receiverCountry': 'Receiver country',
    'receiverPostalCode': 'Receiver postal code',
    'lineItemDescription': 'Line item description',
    'lineItemQuantity': 'Line item quantity',
    'lineItemUnit': 'Line item unit',
    'lineItemUnitPrice': 'Line item unit price',
    'lineItemTotalPrice': 'Line item total price',
    'lineItemProductCode': 'Line item product code',
    'lineItemTax': 'Line item tax',
    'lineItemTaxRate': 'Line item tax rate',
    'lineItemDiscount': 'Line item discount',
    'lineItemCategory': 'Line item category',
    'lineItemTransactionDate': 'Line item transaction date',
  };
  return labels[name] ?? 'Field';
}

type PublicField = {
  id: string;
  name: FieldName;
  label: string;
  value: string;
  correctedValue: string | null;
  confidence: number | null;
  source: FieldSource;
  groupKey: string | null;
  rawType: string | null;
  rawLabel: string | null;
  normalizedValue: string | null;
  valueType: string | null;
  pageNumber: number | null;
  geometry: Prisma.JsonValue | null;
  validationStatus: string | null;
  reviewState: string | null;
  metadata: Prisma.JsonValue;
};

function mapField(field: DocumentField): PublicField {
  return {
    id: field.id,
    name: field.name,
    label: fieldLabel(field.name),
    value: field.value,
    correctedValue: field.correctedValue ?? null,
    confidence: field.confidence ?? null,
    source: field.source,
    groupKey: field.groupKey ?? null,
    rawType: field.rawType ?? null,
    rawLabel: field.rawLabel ?? null,
    normalizedValue: field.normalizedValue ?? null,
    valueType: field.valueType ?? null,
    pageNumber: field.pageNumber ?? null,
    geometry: field.geometry ?? null,
    validationStatus: field.validationStatus ?? null,
    reviewState: field.reviewState ?? null,
    metadata: field.metadata ?? {},
  };
}

function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function jsonArray(value: Prisma.JsonValue | null | undefined): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return jsonArray(value).filter((item): item is string => typeof item === 'string');
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function documentFingerprint(input: {
  merchantName: string | null;
  documentDate: string | null;
  amountMinor: number | null;
  currency: string | null;
  originalFilename?: string | null;
}): string | null {
  if (!input.merchantName || !input.documentDate || input.amountMinor == null) return null;
  const merchant = input.merchantName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [merchant, input.documentDate.slice(0, 10), input.amountMinor, input.currency ?? ''].join('|');
}

function inferDocumentType(contentType: string, fields: DocumentField[]): string {
  if (fieldValue(fields, 'dueDate') || fieldValue(fields, 'poNumber') || fieldValue(fields, 'invoiceId')) return 'invoice';
  if (contentType === 'application/pdf') return 'receipt_pdf';
  return 'receipt';
}

function mapDocumentSummary(d: {
  id: string;
  ownerId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  status: DocumentStatus;
  label: string | null;
  notes: string | null;
  documentType?: string | null;
  category?: string | null;
  claimIntent?: string | null;
  tags?: Prisma.JsonValue;
  qualityScore?: number | null;
  qualityWarnings?: Prisma.JsonValue;
  duplicateFingerprint?: string | null;
  duplicateOfId?: string | null;
  transactionDate?: string | null;
  transactionTime?: string | null;
  retentionUntil?: Date | null;
  previewAvailable?: boolean;
  extractionSummary?: Prisma.JsonValue;
  merchantName: string | null;
  documentDate: string | null;
  amountMinor: number | null;
  currency: string | null;
  fields?: DocumentField[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    ownerId: d.ownerId,
    originalFilename: d.originalFilename,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    label: d.label,
    notes: d.notes,
    documentType: d.documentType ?? (d.fields ? inferDocumentType(d.contentType, d.fields) : null),
    category: d.category ?? null,
    claimIntent: d.claimIntent ?? null,
    tags: jsonArray(d.tags).filter((tag): tag is string => typeof tag === 'string'),
    qualityScore: d.qualityScore ?? null,
    qualityWarnings: jsonArray(d.qualityWarnings),
    duplicateFingerprint: d.duplicateFingerprint ?? null,
    duplicateOfId: d.duplicateOfId ?? null,
    transactionDate: d.transactionDate ?? d.documentDate,
    transactionTime: d.transactionTime ?? null,
    retentionUntil: d.retentionUntil?.toISOString() ?? null,
    previewAvailable: d.previewAvailable ?? true,
    extractionSummary: d.extractionSummary ?? {},
    merchantName: d.merchantName,
    documentDate: d.documentDate,
    amountMinor: d.amountMinor,
    currency: d.currency,
    fields: d.fields?.map(mapField),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString()
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ScopedPrismaService) private readonly scoped: ScopedPrismaService,
    @Inject(UploadSecurityService) private readonly uploadSecurity: UploadSecurityService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(ExtractionService) private readonly extraction: ExtractionService,
    @Inject(ExtractionQueueService) private readonly queue: ExtractionQueueService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  private async assertQueuedJobLimit(input: { ownerId: string; actorRole: string; organizationId?: string | null }) {
    const queuedCount = await this.prisma.extractionJob.count({
      where: {
        status: { in: ['queued', 'processing'] satisfies ExtractionJobStatus[] },
        document: { ownerId: input.ownerId }
      }
    });

    if (queuedCount < QUEUE_ABUSE_LIMITS.maxQueuedExtractionJobsPerUser) return;

    await this.audit.writeEvent({
      action: SECURITY_AUDIT_ACTIONS.rateLimitTriggered,
      entityType: 'security_event',
      entityId: input.ownerId,
      actor: { actorId: input.ownerId, actorRole: input.actorRole },
      message: 'Queued extraction job limit triggered',
      metadata: {
        policy: 'maxQueuedExtractionJobsPerUser',
        limit: QUEUE_ABUSE_LIMITS.maxQueuedExtractionJobsPerUser
      },
      organizationId: input.organizationId ?? null
    });

    throwContractHttpError(429, 'RATE_LIMITED', 'Rate limit exceeded', []);
  }

  private async assertExtractionRetryLimit(input: { documentId: string; actorId: string; actorRole: string; organizationId?: string | null }) {
    const since = new Date(Date.now() - 60 * 60_000);
    const retryCount = await this.prisma.extractionJob.count({
      where: {
        documentId: input.documentId,
        createdAt: { gte: since }
      }
    });

    if (retryCount < QUEUE_ABUSE_LIMITS.maxExtractionRetriesPerDocumentPerHour) return;

    await this.audit.writeEvent({
      action: SECURITY_AUDIT_ACTIONS.rateLimitTriggered,
      entityType: 'security_event',
      entityId: input.documentId,
      actor: { actorId: input.actorId, actorRole: input.actorRole },
      message: 'Extraction retry limit triggered',
      metadata: {
        policy: 'maxExtractionRetriesPerDocumentPerHour',
        limit: QUEUE_ABUSE_LIMITS.maxExtractionRetriesPerDocumentPerHour
      },
      documentId: input.documentId,
      organizationId: input.organizationId ?? null
    });

    throwContractHttpError(429, 'RATE_LIMITED', 'Rate limit exceeded', []);
  }

  async upload(input: {
    ownerId: string;
    actorRole: string;
    organizationId?: string | null;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    body: Buffer;
    label: string | null;
    notes: string | null;
    category?: string | null;
    tags?: string | null;
    claimIntent?: string | null;
    documentType?: string | null;
  }) {
    await this.assertQueuedJobLimit({
      ownerId: input.ownerId,
      actorRole: input.actorRole,
      organizationId: input.organizationId ?? null
    });

    let upload: Awaited<ReturnType<UploadSecurityService['validate']>>;
    try {
      upload = await this.uploadSecurity.validate({
        originalFilename: input.originalFilename,
        clientContentType: input.contentType,
        sizeBytes: input.sizeBytes,
        body: input.body
      });
    } catch (error) {
      await this.audit.writeEvent({
        action: SECURITY_AUDIT_ACTIONS.uploadRejected,
        entityType: 'security_event',
        entityId: input.ownerId,
        actor: { actorId: input.ownerId, actorRole: input.actorRole },
        message: 'Document upload rejected',
        metadata: {},
        organizationId: input.organizationId ?? null
      });
      throw error;
    }

    const provider = this.extraction.resolveProvider(null) as ExtractionProvider;

    const document = await this.prisma.document.create({
      data: {
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        originalFilename: input.originalFilename,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        storageDriver: this.storage.getDriver(),
        storageKey: '',
        status: 'uploaded',
        label: input.label,
        notes: input.notes,
        category: input.category ?? null,
        tags: parseTags(input.tags),
        claimIntent: input.claimIntent ?? null,
        documentType: input.documentType ?? (upload.contentType === 'application/pdf' ? 'receipt_pdf' : 'receipt'),
        pageCount: upload.pageCount,
        extractionSummary: {
          provider,
          stage: 'queued',
          pipelineVersion: this.extraction.getPipelineVersion(),
          upload: {
            detectedContentType: upload.contentType,
            extension: upload.extension,
            imageDimensions: upload.imageDimensions
          }
        }
      }
    });

    const { storageKey, objectRef } = await this.storage.saveUploadedDocumentFile({
      documentId: document.id,
      contentType: upload.contentType,
      body: input.body,
      originalFilename: input.originalFilename
    });

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        storageKey,
        storageProvider: objectRef.provider,
        storageBucket: objectRef.bucket ?? objectRef.root ?? null,
        storageEtag: objectRef.etag ?? null,
        storageSha256: objectRef.sha256,
        storageSizeBytes: objectRef.sizeBytes,
        storageContentType: objectRef.contentType,
        status: 'queued' satisfies DocumentStatus
      }
    });

    const extractionJob = await this.prisma.extractionJob.create({
      data: {
        documentId: updated.id,
        status: 'queued' satisfies ExtractionJobStatus,
        provider,
        pipelineVersion: this.extraction.getPipelineVersion()
      }
    });

    await this.audit.writeEvent({
      action: 'document.uploaded',
      entityType: 'document',
      entityId: updated.id,
      actor: { actorId: input.ownerId, actorRole: input.actorRole },
      message: 'Document uploaded',
      metadata: {},
      documentId: updated.id
    });

    await this.audit.writeEvent({
      action: 'extraction.queued',
      entityType: 'extraction_job',
      entityId: extractionJob.id,
      actor: { actorId: null, actorRole: 'system' },
      message: 'Extraction queued',
      metadata: {},
      documentId: updated.id,
      extractionJobId: extractionJob.id
    });

    await this.queue.enqueue({
      documentId: updated.id,
      extractionJobId: extractionJob.id,
      pipelineVersion: this.extraction.getPipelineVersion(),
      objectRef,
      storageDriver: updated.storageDriver,
      storageKey: updated.storageKey,
      contentType: updated.contentType,
      originalFilename: updated.originalFilename,
      provider: extractionJob.provider
    });

    return {
      document: mapDocumentSummary(updated),
      extractionJob: {
        id: extractionJob.id,
        documentId: extractionJob.documentId,
        status: extractionJob.status,
        provider: extractionJob.provider,
        warningCodes: [],
        confidenceSummary: {},
        errorMessage: extractionJob.errorMessage,
        createdAt: extractionJob.createdAt.toISOString(),
        startedAt: extractionJob.startedAt?.toISOString() ?? null,
        completedAt: extractionJob.completedAt?.toISOString() ?? null
      }
    };
  }

  async retryExtraction(input: { documentId: string; ownerId: string; actorRole: string; provider?: string | null }) {
    const actor = { id: input.ownerId, role: input.actorRole };
    const document = await this.scoped.findDocument(actor, input.documentId, {
      include: { claim: true }
    });

    if (!document) {
      if (await this.scoped.documentExists(input.documentId)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    if (document.claim && document.claim.status !== 'draft') {
      await this.audit.writeEvent({
        action: SECURITY_AUDIT_ACTIONS.extractionRetryDenied,
        entityType: 'security_event',
        entityId: document.id,
        actor: { actorId: input.ownerId, actorRole: input.actorRole },
        message: 'Extraction retry denied',
        metadata: { reason: 'claim_not_draft' },
        documentId: document.id,
        organizationId: document.organizationId
      });
      throwContractHttpError(409, 'CONFLICT', 'Conflict', [
        { path: 'documentId', message: 'Cannot retry extraction after claim submission' }
      ]);
    }

    if (document.status === 'queued' || document.status === 'processing') {
      await this.audit.writeEvent({
        action: SECURITY_AUDIT_ACTIONS.extractionRetryDenied,
        entityType: 'security_event',
        entityId: document.id,
        actor: { actorId: input.ownerId, actorRole: input.actorRole },
        message: 'Extraction retry denied',
        metadata: { reason: 'extraction_in_progress' },
        documentId: document.id,
        organizationId: document.organizationId
      });
      throwContractHttpError(409, 'CONFLICT', 'Conflict', [
        { path: 'documentId', message: `Cannot retry extraction while status is ${document.status}` }
      ]);
    }

    await this.assertExtractionRetryLimit({
      documentId: document.id,
      actorId: input.ownerId,
      actorRole: input.actorRole,
      organizationId: document.organizationId
    });

    const provider = this.resolveProviderForRequest(input.provider) as ExtractionProvider;

    const objectRef = await this.storage.describeDocumentFile({
      storageKey: document.storageKey,
      expectedContentType: document.contentType,
      originalFilename: document.originalFilename
    });

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        status: 'queued' satisfies DocumentStatus,
        storageProvider: objectRef.provider,
        storageBucket: objectRef.bucket ?? objectRef.root ?? null,
        storageEtag: objectRef.etag ?? null,
        storageSha256: objectRef.sha256,
        storageSizeBytes: objectRef.sizeBytes,
        storageContentType: objectRef.contentType,
        merchantName: null,
        documentDate: null,
        amountMinor: null,
        currency: null,
        qualityScore: null,
        qualityWarnings: [],
        extractionSummary: { provider, stage: 'queued', retry: true, pipelineVersion: this.extraction.getPipelineVersion() }
      }
    });

    const extractionJob = await this.prisma.extractionJob.create({
      data: {
        documentId: updated.id,
        status: 'queued' satisfies ExtractionJobStatus,
        provider,
        pipelineVersion: this.extraction.getPipelineVersion()
      }
    });

    await this.audit.writeEvent({
      action: 'extraction.queued',
      entityType: 'extraction_job',
      entityId: extractionJob.id,
      actor: { actorId: input.ownerId, actorRole: input.actorRole },
      message: 'Extraction queued (retry)',
      metadata: { provider: extractionJob.provider },
      documentId: updated.id,
      extractionJobId: extractionJob.id
    });

    await this.queue.enqueue({
      documentId: updated.id,
      extractionJobId: extractionJob.id,
      pipelineVersion: this.extraction.getPipelineVersion(),
      objectRef,
      storageDriver: updated.storageDriver,
      storageKey: updated.storageKey,
      contentType: updated.contentType,
      originalFilename: updated.originalFilename,
      provider: extractionJob.provider
    });

    return {
      document: mapDocumentSummary(updated),
      extractionJob: {
        id: extractionJob.id,
        documentId: extractionJob.documentId,
        status: extractionJob.status,
        provider: extractionJob.provider,
        warningCodes: [],
        confidenceSummary: {},
        errorMessage: extractionJob.errorMessage,
        createdAt: extractionJob.createdAt.toISOString(),
        startedAt: extractionJob.startedAt?.toISOString() ?? null,
        completedAt: extractionJob.completedAt?.toISOString() ?? null
      }
    };
  }

  private resolveProviderForRequest(provider: string | null | undefined) {
    try {
      return this.extraction.resolveProvider(provider);
    } catch (err) {
      if (err instanceof ExtractionProviderValidationError) {
        throwValidationError([{ path: 'provider', message: err.message }], 422);
      }
      throw err;
    }
  }

  async list(input: {
    ownerId: string;
    limit: number;
    offset: number;
    status?: DocumentStatus;
    search?: string;
    category?: string;
    from?: string;
    to?: string;
    minAmount?: number;
    maxAmount?: number;
  }) {
    const where: Prisma.DocumentWhereInput = { ownerId: input.ownerId };
    if (input.status) where.status = input.status;
    if (input.category) where.category = input.category;
    if (input.from || input.to) {
      where.OR = [
        {
          documentDate: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {})
          }
        },
        {
          transactionDate: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {})
          }
        }
      ];
    }
    if (input.minAmount != null || input.maxAmount != null) {
      where.amountMinor = {
        ...(input.minAmount != null ? { gte: input.minAmount } : {}),
        ...(input.maxAmount != null ? { lte: input.maxAmount } : {})
      };
    }
    if (input.search) {
      const search = input.search.trim();
      const searchWhere: Prisma.DocumentWhereInput = {
        OR: [
          { originalFilename: { contains: search, mode: 'insensitive' } },
          { merchantName: { contains: search, mode: 'insensitive' } },
          { label: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { fields: { some: { value: { contains: search, mode: 'insensitive' } } } },
          { fields: { some: { correctedValue: { contains: search, mode: 'insensitive' } } } }
        ]
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchWhere];
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        skip: input.offset,
        include: {
          fields: true,
          extractionJobs: { orderBy: { createdAt: 'desc' }, take: 1 },
          claim: { select: { id: true, status: true } },
          review: { select: { id: true, status: true, decisionNote: true } }
        }
      }),
      this.prisma.document.count({ where })
    ]);

    return {
      documents: documents.map((d) => ({
        ...mapDocumentSummary(d),
        extractionJob: d.extractionJobs[0]
          ? {
              id: d.extractionJobs[0].id,
              status: d.extractionJobs[0].status,
              provider: d.extractionJobs[0].provider,
              warningCodes: stringArray(d.extractionJobs[0].warningCodes),
              confidenceSummary: jsonObject(d.extractionJobs[0].confidenceSummary),
              errorMessage: d.extractionJobs[0].errorMessage,
              createdAt: d.extractionJobs[0].createdAt.toISOString(),
              startedAt: d.extractionJobs[0].startedAt?.toISOString() ?? null,
              completedAt: d.extractionJobs[0].completedAt?.toISOString() ?? null
            }
          : null,
        claim: d.claim,
        review: d.review
      })),
      page: { limit: input.limit, offset: input.offset, total }
    };
  }

  async getById(input: { userId: string; role: string; organizationId?: string | null; id: string }) {
    const actor = { id: input.userId, role: input.role, organizationId: input.organizationId ?? null };
    const document = await this.scoped.findDocument(actor, input.id, {
      include: {
        fields: true,
        extractionJobs: { orderBy: { createdAt: 'desc' }, take: 1, include: { artifact: true } },
        claim: true,
        review: true
      }
    });

    if (!document) {
      if (input.role !== 'consumer' && await this.scoped.documentExists(input.id)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    const latestJob = document.extractionJobs[0] ?? null;

    return {
      document: {
        ...mapDocumentSummary(document),
        extractionJob: latestJob
          ? {
              id: latestJob.id,
              status: latestJob.status,
              provider: latestJob.provider,
              warningCodes: stringArray(latestJob.warningCodes),
              confidenceSummary: jsonObject(latestJob.confidenceSummary),
              errorMessage: latestJob.errorMessage,
              createdAt: latestJob.createdAt.toISOString(),
              startedAt: latestJob.startedAt?.toISOString() ?? null,
              completedAt: latestJob.completedAt?.toISOString() ?? null,
              artifact: latestJob.artifact
                ? {
                    id: latestJob.artifact.id,
                    normalized: latestJob.artifact.normalized,
                    warnings: stringArray(latestJob.artifact.warnings),
                    payload: latestJob.artifact.payload,
                    artifactType: latestJob.artifact.artifactType,
                    stage: latestJob.artifact.stage,
                    createdAt: latestJob.artifact.createdAt.toISOString()
                  }
                : null
            }
          : null,
        claim: document.claim
          ? {
              id: document.claim.id,
              status: document.claim.status
            }
          : null,
        review: document.review
          ? {
              id: document.review.id,
              status: document.review.status,
              decisionNote: document.review.decisionNote
            }
          : null,
      }
    };
  }

  async preview(input: { userId: string; role: string; organizationId?: string | null; id: string }) {
    const actor = { id: input.userId, role: input.role, organizationId: input.organizationId ?? null };
    const document = await this.scoped.findDocument(actor, input.id, {
      include: { review: { select: { status: true, reviewerId: true } } }
    });

    if (!document) {
      if (input.role !== 'consumer' && await this.scoped.documentExists(input.id)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    const file = await this.storage.getDocumentFile({
      storageKey: document.storageKey,
      expectedContentType: document.contentType
    });

    await this.audit.writeEvent({
      action: SECURITY_AUDIT_ACTIONS.documentPreviewed,
      entityType: 'document',
      entityId: document.id,
      actor: { actorId: input.userId, actorRole: input.role },
      message: 'Document previewed',
      metadata: {},
      documentId: document.id,
      organizationId: document.organizationId
    });

    return {
      body: file.body,
      contentType: file.contentType,
      originalFilename: document.originalFilename
    };
  }

  async updateMetadata(input: {
    documentId: string;
    ownerId: string;
    actorRole: string;
    label?: string | null;
    notes?: string | null;
    category?: string | null;
    documentType?: string | null;
    tags?: string[];
    retentionUntil?: string | null;
  }) {
    const actor = { id: input.ownerId, role: input.actorRole };
    const document = await this.scoped.findDocument(actor, input.documentId, {
      select: { id: true, ownerId: true }
    });
    if (!document) {
      if (await this.scoped.documentExists(input.documentId)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.retentionUntil !== undefined
          ? { retentionUntil: input.retentionUntil ? new Date(input.retentionUntil) : null }
          : {})
      },
      include: { fields: true }
    });

    await this.audit.writeEvent({
      action: 'document.metadata_updated',
      entityType: 'document',
      entityId: document.id,
      actor: { actorId: input.ownerId, actorRole: input.actorRole },
      message: 'Document metadata updated',
      metadata: {
        changedFields: [
          ...(input.label !== undefined ? ['label'] : []),
          ...(input.notes !== undefined ? ['notes'] : []),
          ...(input.category !== undefined ? ['category'] : []),
          ...(input.documentType !== undefined ? ['documentType'] : []),
          ...(input.tags !== undefined ? ['tags'] : []),
          ...(input.retentionUntil !== undefined ? ['retentionUntil'] : [])
        ]
      },
      documentId: document.id
    });

    return { document: mapDocumentSummary(updated) };
  }

  async timeline(input: { userId: string; role: string; organizationId?: string | null; id: string }) {
    await this.getById(input);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        OR: [
          { documentId: input.id },
          { entityType: 'document', entityId: input.id },
          { metadata: { path: ['documentId'], equals: input.id } }
        ]
      },
      orderBy: { createdAt: 'asc' },
      take: 200
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId: event.actorId,
        actorRole: event.actorRole,
        message: event.message,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString()
      }))
    };
  }

  async duplicates(input: { userId: string; id: string }) {
    const document = await this.scoped.findDocument({ id: input.userId, role: 'consumer' }, input.id, {
      include: { fields: true }
    });
    if (!document) throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);

    const fingerprint =
      document.duplicateFingerprint ??
      documentFingerprint({
        merchantName: document.merchantName,
        documentDate: document.documentDate,
        amountMinor: document.amountMinor,
        currency: document.currency,
        originalFilename: document.originalFilename
      });

    const where: Prisma.DocumentWhereInput = {
      ownerId: document.ownerId,
      id: { not: document.id },
      OR: [
        ...(fingerprint ? [{ duplicateFingerprint: fingerprint }] : []),
        {
          merchantName: document.merchantName,
          documentDate: document.documentDate,
          amountMinor: document.amountMinor
        }
      ]
    };

    const matches = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { fields: true }
    });

    return {
      fingerprint,
      duplicates: matches.map((match) => ({
        ...mapDocumentSummary(match),
        reason:
          fingerprint && match.duplicateFingerprint === fingerprint
            ? 'same fingerprint'
            : 'same merchant, date, and amount'
      }))
    };
  }

  async insights(input: { ownerId: string }) {
    const [documents, claims] = await Promise.all([
      this.prisma.document.findMany({
        where: { ownerId: input.ownerId },
        include: { fields: true, extractionJobs: { orderBy: { createdAt: 'desc' }, take: 1 } }
      }),
      this.prisma.claim.findMany({
        where: { consumerId: input.ownerId },
        include: { document: true }
      })
    ]);

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;

    const byMonth = new Map<string, { month: string; amountMinor: number; count: number; taxMinor: number; serviceMinor: number; discountMinor: number }>();
    const byMerchant = new Map<string, { merchantName: string; amountMinor: number; count: number }>();
    const byCategory = new Map<string, { category: string; amountMinor: number; count: number }>();
    const byRecordType = new Map<string, { recordType: string; amountMinor: number; count: number }>();

    let totalAmountMinor = 0;
    let currentMonthAmountMinor = 0;
    let currentMonthDocumentCount = 0;
    let previousMonthAmountMinor = 0;
    let currentMonthTaxMinor = 0;
    let currentMonthServiceMinor = 0;
    let currentMonthDiscountMinor = 0;
    let needsReviewCount = 0;
    let failedCount = 0;
    let processingCount = 0;
    let claimableAmountMinor = 0;
    let largestDocument: ReturnType<typeof mapDocumentSummary> | null = null;

    const claimDocumentIds = new Set(claims.map((claim) => claim.documentId));

    for (const document of documents) {
      const amount = effectiveDocumentAmountMinor(document);
      const docMonth = effectiveDocumentMonth(document);
      const tax = amountLikeToMinor(fieldValue(document.fields, 'tax')) ?? 0;
      const service = amountLikeToMinor(fieldValue(document.fields, 'serviceCharge')) ?? 0;
      const discount = amountLikeToMinor(fieldValue(document.fields, 'discount')) ?? amountLikeToMinor(fieldValue(document.fields, 'voucher')) ?? 0;

      totalAmountMinor += amount;
      if (docMonth === monthKey) {
        currentMonthAmountMinor += amount;
        currentMonthDocumentCount += 1;
        currentMonthTaxMinor += tax;
        currentMonthServiceMinor += service;
        currentMonthDiscountMinor += discount;
      }
      if (docMonth === previousMonthKey) previousMonthAmountMinor += amount;
      if (document.status === 'correction_required') needsReviewCount += 1;
      if (document.status === 'failed') failedCount += 1;
      if (document.status === 'queued' || document.status === 'processing') processingCount += 1;
      if ((document.status === 'extracted' || document.status === 'corrected') && !claimDocumentIds.has(document.id)) {
        claimableAmountMinor += amount;
      }

      const monthEntry = byMonth.get(docMonth) ?? { month: docMonth, amountMinor: 0, count: 0, taxMinor: 0, serviceMinor: 0, discountMinor: 0 };
      monthEntry.amountMinor += amount;
      monthEntry.count += 1;
      monthEntry.taxMinor += tax;
      monthEntry.serviceMinor += service;
      monthEntry.discountMinor += discount;
      byMonth.set(docMonth, monthEntry);

      const merchant = document.merchantName ?? 'Unclassified merchant';
      const merchantEntry = byMerchant.get(merchant) ?? { merchantName: merchant, amountMinor: 0, count: 0 };
      merchantEntry.amountMinor += amount;
      merchantEntry.count += 1;
      byMerchant.set(merchant, merchantEntry);

      const category = effectiveDocumentCategory(document);
      const categoryEntry = byCategory.get(category) ?? { category, amountMinor: 0, count: 0 };
      categoryEntry.amountMinor += amount;
      categoryEntry.count += 1;
      byCategory.set(category, categoryEntry);

      const recordType = document.documentType ?? document.claimIntent ?? 'receipt';
      const recordTypeEntry = byRecordType.get(recordType) ?? { recordType, amountMinor: 0, count: 0 };
      recordTypeEntry.amountMinor += amount;
      recordTypeEntry.count += 1;
      byRecordType.set(recordType, recordTypeEntry);

      if (!largestDocument || amount > (largestDocument.amountMinor ?? 0)) largestDocument = mapDocumentSummary(document);
    }

    const statusCounts = documents.reduce<Record<string, number>>((acc, document) => {
      acc[document.status] = (acc[document.status] ?? 0) + 1;
      return acc;
    }, {});

    const claimStatusCounts = claims.reduce<Record<string, number>>((acc, claim) => {
      acc[claim.status] = (acc[claim.status] ?? 0) + 1;
      return acc;
    }, {});

    const merchantsBySpend = Array.from(byMerchant.values()).sort((a, b) => b.amountMinor - a.amountMinor);
    const merchantsByCount = [...merchantsBySpend].sort((a, b) => b.count - a.count || b.amountMinor - a.amountMinor);
    const monthOverMonthChange =
      previousMonthAmountMinor === 0
        ? null
        : ((currentMonthAmountMinor - previousMonthAmountMinor) / previousMonthAmountMinor) * 100;

    return {
      insights: {
        currentMonthSpendMinor: currentMonthAmountMinor,
        previousMonthSpendMinor: previousMonthAmountMinor,
        monthOverMonthChange,
        currentMonthDocumentCount,
        totalTaxMinor: currentMonthTaxMinor,
        totalServiceChargeMinor: currentMonthServiceMinor,
        totalDiscountMinor: currentMonthDiscountMinor,
        averageReceiptMinor: currentMonthDocumentCount ? Math.round(currentMonthAmountMinor / currentMonthDocumentCount) : 0,
        largestDocument,
        mostFrequentMerchant: merchantsByCount[0] ? { merchantName: merchantsByCount[0].merchantName, count: merchantsByCount[0].count } : null,
        topMerchantBySpend: merchantsBySpend[0] ? { merchantName: merchantsBySpend[0].merchantName, amountMinor: merchantsBySpend[0].amountMinor } : null,
        statusCounts,
        claimCounts: claimStatusCounts,
        monthlySpend: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
        merchantSpend: merchantsBySpend.slice(0, 8),
        categorySpend: Array.from(byCategory.values()).sort((a, b) => b.amountMinor - a.amountMinor),
        recordTypeSpend: Array.from(byRecordType.values()).sort((a, b) => b.amountMinor - a.amountMinor),
        recentDocuments: [...documents]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, 6)
          .map(mapDocumentSummary),
        recentClaims: [...claims]
          .filter((claim) => Boolean(claim.submittedAt))
          .sort((a, b) => b.submittedAt!.getTime() - a.submittedAt!.getTime())
          .slice(0, 6)
          .map((claim) => ({
            id: claim.id,
            documentId: claim.documentId,
            status: claim.status,
            purpose: claim.purpose,
            note: claim.note,
            submittedAt: claim.submittedAt!.toISOString(),
            decidedAt: claim.decidedAt?.toISOString() ?? null,
            amountMinor: claim.document.amountMinor,
            merchantName: claim.document.merchantName,
            currency: claim.document.currency
          })),
        summary: {
          totalDocuments: documents.length,
          totalAmountMinor,
          currentMonthAmountMinor,
          previousMonthAmountMinor,
          monthOverMonthDeltaMinor: currentMonthAmountMinor - previousMonthAmountMinor,
          needsReviewCount,
          failedCount,
          processingCount,
          claimableAmountMinor,
          statusCounts,
          claimStatusCounts
        },
        lastUpdatedAt: (documents.reduce<Date | null>((latest, document) => {
          if (!latest || document.updatedAt.getTime() > latest.getTime()) return document.updatedAt;
          return latest;
        }, null) ?? now).toISOString()
      }
    };
  }

  async applyCorrections(input: {
    documentId: string;
    ownerId: string;
    actorRole: string;
    fields: Array<{ id?: string; name: FieldName; correctedValue: string | null }>;
  }) {
    if (!input.fields || input.fields.length === 0) {
      throwValidationError([{ path: 'fields', message: 'fields is required' }]);
    }

    const actor = { id: input.ownerId, role: input.actorRole };
    const document = await this.scoped.findDocument(actor, input.documentId, {
      include: { claim: true }
    });

    if (!document) {
      if (await this.scoped.documentExists(input.documentId)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    if (document.status !== 'extracted' && document.status !== 'correction_required' && document.status !== 'corrected') {
      throwContractHttpError(409, 'CONFLICT', 'Conflict', []);
    }

    // Find-or-create corrected fields. Use findFirst + update/create instead of upsert
    // because Prisma's compound unique key type constrains groupKey to `string` even for
    // nullable columns, making the upsert where clause untypeable without a cast.
    for (const f of input.fields) {
      const existing = f.id
        ? await this.prisma.documentField.findFirst({
            where: { id: f.id, documentId: document.id }
          })
        : await this.prisma.documentField.findFirst({
            where: { documentId: document.id, name: f.name, groupKey: null }
          });
      if (existing) {
        await this.prisma.documentField.update({
          where: { id: existing.id },
          data: { correctedValue: f.correctedValue, source: 'manual', reviewState: 'corrected' }
        });
      } else {
        await this.prisma.documentField.create({
          data: {
            documentId: document.id,
            name: f.name,
            value: '',
            correctedValue: f.correctedValue,
            source: 'manual',
            groupKey: null,
            reviewState: 'corrected'
          }
        });
      }
    }

    // Sync denormalized summary columns (merchantName, amountMinor, documentDate, currency)
    // with the corrected field values so the Evidence Summary reflects corrections.
    // Uses the same amount parsing logic as the extraction worker (_parse_amount_str).
    const summaryFields = await this.prisma.documentField.findMany({
      where: {
        documentId: document.id,
        name: { in: ['merchantName', 'documentDate', 'amountMinor', 'currency'] }
      }
    });
    const summaryUpdate: Record<string, string | number | null> = {};
    for (const field of summaryFields) {
      const resolved = field.correctedValue ?? field.value;
      if (field.name === 'amountMinor') {
        if (resolved) {
          const cleaned = resolved.replace(/,/g, '').trim();
          const num = Number(cleaned);
          summaryUpdate.amountMinor = Number.isNaN(num) ? null
            : cleaned.includes('.') ? Math.round(num * 100)
            : num; // integer → already in minor units
        } else {
          summaryUpdate.amountMinor = null;
        }
      } else {
        summaryUpdate[field.name] = resolved || null;
      }
    }

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { status: 'corrected', ...summaryUpdate },
      include: { fields: true }
    });

    await this.audit.writeEvent({
      action: 'document.corrected',
      entityType: 'document',
      entityId: updated.id,
      actor: { actorId: input.ownerId, actorRole: input.actorRole },
      message: 'Document corrected',
      metadata: {},
      documentId: updated.id
    });

    return {
      document: {
        ...mapDocumentSummary(updated),
        fields: updated.fields.map(mapField),
      }
    };
  }

  async deleteDocument(input: { documentId: string; userId: string; role: string; organizationId?: string | null }) {
    const actor = { id: input.userId, role: input.role, organizationId: input.organizationId ?? null };
    // Step 1: Pre-fetch for auth + claim check (before transaction)
    const document = await this.scoped.findDocument(actor, input.documentId, {
      include: {
        claim: { select: { id: true, status: true } }
      }
    });

    if (!document) {
      if (await this.scoped.documentExists(input.documentId)) {
        throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
      }
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    // Step 2: Block deletion of documents with active claims
    if (document.claim && document.claim.status !== 'rejected' && document.claim.status !== 'draft') {
      throwContractHttpError(409, 'CONFLICT', 'Conflict', [
        { path: 'documentId', message: 'Cannot delete document with active or approved claim. Status: ' + document.claim.status }
      ]);
    }

    // Step 3: Database deletion in transaction
    await this.prisma.$transaction(async (tx) => {
      // Re-check claim status inside transaction (concurrency safety)
      const current = await this.scoped.findDocument(actor, input.documentId, {
        include: { claim: { select: { id: true, status: true } } }
      }, tx);

      if (!current) {
        throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
      }

      if (current.claim && current.claim.status !== 'rejected' && current.claim.status !== 'draft') {
        throwContractHttpError(409, 'CONFLICT', 'Conflict', [
          { path: 'documentId', message: 'Cannot delete document with active or approved claim' }
        ]);
      }

      // Delete claim first if exists (Claim → onDelete: Restrict on Document)
      if (current.claim) {
        await tx.claim.delete({ where: { id: current.claim.id } });
      }

      // Delete document; existing audit rows retain entityId and get documentId set null.
      await tx.document.delete({ where: { id: input.documentId } });
    });

    // Step 4: Best-effort storage cleanup after the transaction, never inside it.
    await this.storage.deleteDocumentFile(document.storageKey);

    // Step 5: Audit
    if (document.claim) {
      await this.audit.writeEvent({
        action: 'claim.deleted',
        entityType: 'claim',
        entityId: document.claim.id,
        actor: { actorId: input.userId, actorRole: input.role },
        message: 'Claim deleted',
        metadata: {
          deletedDocumentId: input.documentId,
          deletedClaimId: document.claim.id,
          storageDriver: document.storageDriver
        },
        organizationId: document.organizationId,
      });
    }
    await this.audit.writeEvent({
      action: 'document.deleted',
      entityType: 'document',
      entityId: input.documentId,
      actor: { actorId: input.userId, actorRole: input.role },
      message: 'Document deleted',
      metadata: {
        deletedDocumentId: input.documentId,
        storageDriver: document.storageDriver,
        deletedClaimId: document.claim?.id ?? null,
        claimStatus: document.claim?.status ?? null
      },
      organizationId: document.organizationId,
    });
  }

  async deleteAllDocuments(input: { userId: string; role: string }) {
    if (!isSystemAdminRole(input.role)) {
      throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
    }

    // Step 1: Pre-fetch document IDs and storage keys (before transaction)
    const documents = await this.prisma.document.findMany({
      select: { id: true, storageKey: true }
    });
    const claimCount = await this.prisma.claim.count();
    const count = documents.length;

    if (count === 0) {
      return { deletedCount: 0, claimCount: 0 };
    }

    await this.audit.writeEvent({
      action: SECURITY_AUDIT_ACTIONS.adminActionAttempted,
      entityType: 'security_event',
      entityId: 'documents.bulk_delete',
      actor: { actorId: input.userId, actorRole: input.role },
      message: 'System administrator bulk document deletion attempted',
      metadata: { operation: 'documents.bulk_delete', documentCount: count, claimCount }
    });

    // Step 2: Transactional DB deletion in correct order
    await this.prisma.$transaction(async (tx) => {
      await tx.review.deleteMany();
      await tx.claim.deleteMany();
      await tx.documentField.deleteMany();
      await tx.extractionJob.deleteMany();
      await tx.document.deleteMany();
    });

    // Step 3: Best-effort storage cleanup (AFTER transaction)
    for (const doc of documents) {
      await this.storage.deleteDocumentFile(doc.storageKey);
    }

    // Step 4: Audit
    await this.audit.writeEvent({
      action: 'documents.bulk_deleted',
      entityType: 'document',
      entityId: 'bulk',
      actor: { actorId: input.userId, actorRole: input.role },
      message: `Bulk delete: ${count} documents, ${claimCount} claims`,
      metadata: { count, claimCount },
    });
    await this.audit.writeEvent({
      action: SECURITY_AUDIT_ACTIONS.adminActionCompleted,
      entityType: 'security_event',
      entityId: 'documents.bulk_delete',
      actor: { actorId: input.userId, actorRole: input.role },
      message: 'System administrator bulk document deletion completed',
      metadata: { operation: 'documents.bulk_delete', documentCount: count, claimCount }
    });

    return { deletedCount: count, claimCount };
  }
}
