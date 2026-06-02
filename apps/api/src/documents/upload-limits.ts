export const DOCUMENT_UPLOAD_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxPdfPages: 100,
  maxImageWidth: 12_000,
  maxImageHeight: 12_000,
  maxImagePixels: 50_000_000
} as const;

export const ALLOWED_UPLOAD_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const ALLOWED_UPLOAD_EXTENSIONS_BY_MIME: Record<AllowedUploadMimeType, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png']
};
