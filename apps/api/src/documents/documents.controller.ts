import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Patch, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { DocumentStatus } from '@balance/db';
import {
  correctionPayloadSchema,
  documentMetadataPatchSchema,
  documentListQuerySchema,
  documentUploadMetadataSchema,
  extractionRetrySchema,
  type CorrectionPayload,
  type DocumentMetadataPatch,
  type DocumentListQuery,
  type ExtractionRetryPayload,
  type DocumentUploadMetadata
} from '@balance/schemas';

import { AuthGuard, type AuthenticatedRequestUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequireVerifiedEmailForRoles } from '../auth/verified-email.decorator';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { Actions } from '../authorization/actions';
import { CheckPolicies } from '../authorization/policy.decorator';
import { PolicyGuard } from '../authorization/policy.guard';
import { Subjects } from '../authorization/subjects';
import { throwValidationError } from '../common/contract-errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BalanceRateLimit } from '../rate-limit/rate-limit.decorator';

import { DocumentsService } from './documents.service';
import { DOCUMENT_UPLOAD_LIMITS } from './upload-limits';

type MulterFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function safeDispositionFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/g, '_');
}

@Controller('documents')
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Post()
  @BalanceRateLimit('upload')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @CheckPolicies((ability) => ability.can(Actions.create, Subjects.Document))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: DOCUMENT_UPLOAD_LIMITS.maxFileBytes }
    })
  )
  async upload(
    @UploadedFile() file: MulterFile | undefined,
    @Body(new ZodValidationPipe(documentUploadMetadataSchema)) metadata: DocumentUploadMetadata,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    if (!file) {
      throwValidationError([{ path: 'file', message: 'file is required' }], 422);
    }

    return this.documents.upload({
      ownerId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      body: file.buffer,
      label: metadata.label ?? null,
      notes: metadata.notes ?? null,
      category: metadata.category ?? null,
      tags: metadata.tags ?? null,
      claimIntent: metadata.claimIntent ?? null,
      documentType: metadata.documentType ?? null
    });
  }

  @Get()
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async list(
    @Query(new ZodValidationPipe(documentListQuerySchema)) query: DocumentListQuery,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const status = query.status?.trim();
    const input: {
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
    } = {
      ownerId: user.id,
      limit,
      offset
    };

    if (status) {
      input.status = status as DocumentStatus;
    }
    if (query.search) input.search = query.search;
    if (query.category) input.category = query.category;
    if (query.from) input.from = query.from;
    if (query.to) input.to = query.to;
    if (query.minAmount !== undefined) input.minAmount = query.minAmount;
    if (query.maxAmount !== undefined) input.maxAmount = query.maxAmount;

    return this.documents.list(input);
  }

  @Get('insights')
  @BalanceRateLimit('insights')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async insights(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.insights({ ownerId: user.id });
  }

  @Get(':id')
  @BalanceRateLimit('read')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.getById({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
  }

  @Get(':id/preview')
  @BalanceRateLimit('preview')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.preview, Subjects.StorageObject))
  @Header('Cache-Control', 'private, no-store')
  async preview(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    const preview = await this.documents.preview({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
    return new StreamableFile(preview.body, {
      type: preview.contentType,
      disposition: `inline; filename="${safeDispositionFilename(preview.originalFilename)}"`
    });
  }

  @Get(':id/timeline')
  @BalanceRateLimit('read')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async timeline(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.timeline({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
  }

  @Get(':id/duplicates')
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async duplicates(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.duplicates({ id, userId: user.id });
  }

  @Patch(':id/metadata')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @RequireVerifiedEmailForRoles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.Document))
  async updateMetadata(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(documentMetadataPatchSchema)) body: DocumentMetadataPatch,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const input: {
      documentId: string;
      ownerId: string;
      actorRole: string;
      label?: string | null;
      notes?: string | null;
      category?: string | null;
      documentType?: string | null;
      tags?: string[];
      retentionUntil?: string | null;
    } = {
      documentId: id,
      ownerId: user.id,
      actorRole: user.role
    };
    if (body.label !== undefined) input.label = body.label;
    if (body.notes !== undefined) input.notes = body.notes;
    if (body.category !== undefined) input.category = body.category;
    if (body.documentType !== undefined) input.documentType = body.documentType;
    if (body.tags !== undefined) input.tags = body.tags;
    if (body.retentionUntil !== undefined) input.retentionUntil = body.retentionUntil;

    return this.documents.updateMetadata(input);
  }

  @Patch(':id/corrections')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @RequireVerifiedEmailForRoles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.DocumentField))
  async corrections(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(correctionPayloadSchema)) body: CorrectionPayload,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.documents.applyCorrections({
      documentId: id,
      ownerId: user.id,
      actorRole: user.role,
      fields: body.fields.map((field) =>
        field.id
          ? { id: field.id, name: field.name, correctedValue: field.correctedValue }
          : { name: field.name, correctedValue: field.correctedValue }
      )
    });
  }

  @Post(':id/extraction/retry')
  @BalanceRateLimit('retry')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @RequireVerifiedEmailForRoles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.retryExtraction, Subjects.ExtractionJob))
  async retryExtraction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extractionRetrySchema)) body: ExtractionRetryPayload,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.documents.retryExtraction({
      documentId: id,
      ownerId: user.id,
      actorRole: user.role,
      provider: body.provider ?? null
    });
  }

  @Delete(':id')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin', 'system_admin')
  @RequireVerifiedEmailForRoles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.delete, Subjects.Document))
  @HttpCode(204)
  async deleteDocument(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    await this.documents.deleteDocument({
      documentId: id,
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });
    return;
  }

  @Delete()
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('system_admin')
  @RequireVerifiedEmailForRoles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.manage, 'all'))
  async deleteAllDocuments(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.deleteAllDocuments({
      userId: user.id,
      role: user.role,
    });
  }
}
