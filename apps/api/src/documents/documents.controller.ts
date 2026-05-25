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
import { throwValidationError } from '../common/contract-errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { DocumentsService } from './documents.service';

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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
  async insights(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.insights({ ownerId: user.id });
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.getById({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
  }

  @Get(':id/preview')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  @Header('Cache-Control', 'private, max-age=60')
  async preview(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    const preview = await this.documents.preview({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
    return new StreamableFile(preview.body, {
      type: preview.contentType,
      disposition: `inline; filename="${safeDispositionFilename(preview.originalFilename)}"`
    });
  }

  @Get(':id/timeline')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  async timeline(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.timeline({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
  }

  @Get(':id/duplicates')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
  async duplicates(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.duplicates({ id, userId: user.id });
  }

  @Patch(':id/metadata')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin')
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer', 'staff', 'admin', 'system_admin')
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('system_admin')
  async deleteAllDocuments(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.documents.deleteAllDocuments({
      userId: user.id,
      role: user.role,
    });
  }
}
