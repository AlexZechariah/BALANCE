import path from 'node:path';

import { Injectable } from '@nestjs/common';

import {
  ALLOWED_UPLOAD_EXTENSIONS_BY_MIME,
  ALLOWED_UPLOAD_MIME_TYPES,
  DOCUMENT_UPLOAD_LIMITS,
  type AllowedUploadMimeType
} from './upload-limits';
import { throwUnsupportedUpload, throwUploadTooLarge } from './upload-security.errors';
import { apiMetrics } from '../observability/metrics';

type FileTypeModule = {
  fileTypeFromBuffer(buffer: Uint8Array | ArrayBuffer): Promise<{ ext: string; mime: string } | undefined>;
};

type UploadDimensions = {
  width: number;
  height: number;
};

export type ValidatedUpload = {
  contentType: AllowedUploadMimeType;
  extension: string;
  sizeBytes: number;
  pageCount: number | null;
  imageDimensions: UploadDimensions | null;
};

const importFileType = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<FileTypeModule>;

async function loadFileType(): Promise<FileTypeModule> {
  try {
    return await importFileType('file-type');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING') {
      throw err;
    }
    return import('file-type') as Promise<FileTypeModule>;
  }
}

function extensionFromFilename(filename: string): string {
  return path.extname(filename).replace(/^\./, '').trim().toLowerCase();
}

function isAllowedMime(mime: string): mime is AllowedUploadMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}

function assertAllowedExtension(contentType: AllowedUploadMimeType, extension: string): void {
  if (!extension || !ALLOWED_UPLOAD_EXTENSIONS_BY_MIME[contentType].includes(extension)) {
    throwUnsupportedUpload('file', 'Filename extension is not allowed for the detected file type');
  }
}

function estimatePdfPageCount(body: Buffer): number | null {
  const header = body.subarray(0, 8).toString('latin1');
  if (!header.startsWith('%PDF-')) {
    throwUnsupportedUpload('file', 'PDF signature is invalid');
  }

  const sample = body.subarray(0, Math.min(body.byteLength, 2_000_000)).toString('latin1');
  const matches = sample.match(/\/Type\s*\/Page\b/g);
  return matches?.length ? matches.length : null;
}

function readPngDimensions(body: Buffer): UploadDimensions {
  if (body.byteLength < 24 || body.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throwUnsupportedUpload('file', 'PNG dimensions are invalid');
  }

  return {
    width: body.readUInt32BE(16),
    height: body.readUInt32BE(20)
  };
}

function readJpegDimensions(body: Buffer): UploadDimensions {
  if (body.byteLength < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
    throwUnsupportedUpload('file', 'JPEG signature is invalid');
  }

  let offset = 2;
  while (offset + 9 < body.byteLength) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = body[offset + 1];
    const segmentLength = body.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      throwUnsupportedUpload('file', 'JPEG segment is invalid');
    }

    if (marker && marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: body.readUInt16BE(offset + 5),
        width: body.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + segmentLength;
  }

  throwUnsupportedUpload('file', 'JPEG dimensions are missing');
}

function assertImageLimits(dimensions: UploadDimensions): void {
  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > DOCUMENT_UPLOAD_LIMITS.maxImageWidth ||
    dimensions.height > DOCUMENT_UPLOAD_LIMITS.maxImageHeight ||
    dimensions.width * dimensions.height > DOCUMENT_UPLOAD_LIMITS.maxImagePixels
  ) {
    throwUploadTooLarge('file', 'Image dimensions exceed the upload limit');
  }
}

@Injectable()
export class UploadSecurityService {
  async validate(input: { originalFilename: string; clientContentType: string; sizeBytes: number; body: Buffer }): Promise<ValidatedUpload> {
    try {
      const result = await this.validateUpload(input);
      apiMetrics.recordUploadAccepted(result.contentType);
      return result;
    } catch (error) {
      apiMetrics.recordUploadRejected(error);
      throw error;
    }
  }

  private async validateUpload(input: { originalFilename: string; clientContentType: string; sizeBytes: number; body: Buffer }): Promise<ValidatedUpload> {
    if (!input.body.byteLength) {
      throwUnsupportedUpload('file', 'Uploaded file is empty');
    }

    if (input.body.byteLength > DOCUMENT_UPLOAD_LIMITS.maxFileBytes || input.sizeBytes > DOCUMENT_UPLOAD_LIMITS.maxFileBytes) {
      throwUploadTooLarge('file', 'File exceeds the upload limit');
    }

    const extension = extensionFromFilename(input.originalFilename);
    const { fileTypeFromBuffer } = await loadFileType();
    const detected = await fileTypeFromBuffer(input.body);
    if (!detected || !isAllowedMime(detected.mime)) {
      throwUnsupportedUpload('file', 'File content is not an allowed document type');
    }

    assertAllowedExtension(detected.mime, extension);

    if (detected.mime === 'application/pdf') {
      const pageCount = estimatePdfPageCount(input.body);
      if (pageCount !== null && pageCount > DOCUMENT_UPLOAD_LIMITS.maxPdfPages) {
        throwUploadTooLarge('file', 'PDF page count exceeds the upload limit');
      }
      return { contentType: detected.mime, extension, sizeBytes: input.body.byteLength, pageCount, imageDimensions: null };
    }

    const imageDimensions = detected.mime === 'image/png'
      ? readPngDimensions(input.body)
      : readJpegDimensions(input.body);
    assertImageLimits(imageDimensions);

    return {
      contentType: detected.mime,
      extension,
      sizeBytes: input.body.byteLength,
      pageCount: null,
      imageDimensions
    };
  }
}
