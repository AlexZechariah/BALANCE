import { z } from 'zod';
import {
  CLAIM_STATUSES,
  DOCUMENT_STATUSES,
  REVIEW_STATUSES,
  REQUESTABLE_EXTRACTION_PROVIDERS,
  FIELD_NAMES,
  BALANCE_CATEGORIES,
  CONSUMER_RECORD_TYPES,
  ENTERPRISE_CLAIM_INTENTS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  blockedPasswordValue,
  normalizeBalanceCategoryValue,
  type ClaimStatus,
  type DocumentStatus,
  type ReviewStatus
} from '@balance/types';

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
  z.string().trim().optional()
);

const optionalNullableTrimmedString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim().length === 0 ? null : value),
  z.string().trim().nullable().optional()
);

const categorySchema = z.preprocess(
  normalizeBalanceCategoryValue,
  z.enum(BALANCE_CATEGORIES, { message: 'Category is required' })
);

const optionalNullableCategorySchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  return normalizeBalanceCategoryValue(value);
}, z.enum(BALANCE_CATEGORIES).nullable().optional());

const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM format');

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`)
  .refine((val) => !blockedPasswordValue(val), 'Password is too common');

const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const loginRequestSchema = strictObject({
  email: z.string().email(),
  password: z.string().min(1)
});

export const registerRequestSchema = strictObject({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  displayName: z.string().trim().min(1, 'Display name is required').max(100, 'Display name must not exceed 100 characters'),
  orgName: z.string().trim().min(1, 'Organization name is required').max(100).optional(),
});

export const documentUploadMetadataSchema = strictObject({
  label: z.string().trim().min(1, 'Label is required').max(120, 'Label must not exceed 120 characters'),
  notes: optionalNullableTrimmedString,
  documentType: z.enum(CONSUMER_RECORD_TYPES).optional(),
  category: categorySchema,
  tags: optionalNullableTrimmedString,
  claimIntent: z.enum(ENTERPRISE_CLAIM_INTENTS).nullable().optional()
});

export const documentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  search: optionalTrimmedString,
  category: categorySchema.optional(),
  from: optionalTrimmedString,
  to: optionalTrimmedString,
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional()
});

export const correctionPayloadSchema = strictObject({
  fields: z
    .array(
      strictObject({
        id: z.string().uuid().optional(),
        name: z.enum(FIELD_NAMES),
        correctedValue: z.string().nullable()
      })
    )
    .min(1)
});

export const extractionRetrySchema = strictObject({
  provider: z.enum(REQUESTABLE_EXTRACTION_PROVIDERS).optional()
});

export const documentMetadataPatchSchema = strictObject({
  label: z.string().trim().min(1, 'Label is required').max(120, 'Label must not exceed 120 characters').nullable().optional(),
  notes: optionalNullableTrimmedString,
  category: optionalNullableCategorySchema,
  documentType: z.enum([...CONSUMER_RECORD_TYPES, 'invoice', 'receipt', 'receipt_pdf']).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  retentionUntil: z.string().datetime().nullable().optional()
});

export const claimSubmissionPayloadSchema = strictObject({
  documentId: z.string().uuid(),
  purpose: z.string().min(1),
  note: optionalTrimmedString
});

export const claimListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(CLAIM_STATUSES).optional()
});

export const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: z.enum(REVIEW_STATUSES).optional()
});

export const reviewApprovePayloadSchema = strictObject({
  note: optionalTrimmedString
});

export const reviewRejectPayloadSchema = strictObject({
  note: z.string().trim().min(1)
});

export const auditQuerySchema = z.object({
  documentId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
  reviewId: z.string().uuid().optional(),
  action: optionalTrimmedString,
  entityType: optionalTrimmedString,
  actorRole: optionalTrimmedString,
  search: optionalTrimmedString,
  from: optionalTrimmedString,
  to: optionalTrimmedString,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const accountUpdateRequestSchema = strictObject({
  displayName: z.string().trim().min(1, 'Display name is required').max(100, 'Display name must not exceed 100 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  currentPassword: z.string().min(1, 'Current password is required').optional(),
  newPassword: passwordSchema.optional()
}).superRefine((value, ctx) => {
  if ((value.email || value.newPassword) && !value.currentPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['currentPassword'],
      message: 'Current password is required for email or password changes'
    });
  }
});

export const passwordResetRequestSchema = strictObject({
  email: z.string().email('Invalid email address')
});

export const passwordResetConfirmRequestSchema = strictObject({
  token: z.string().min(20, 'Reset token is required'),
  password: passwordSchema
});

export const emailVerificationRequestSchema = strictObject({
  email: z.string().email('Invalid email address')
});

export const emailVerificationConfirmRequestSchema = strictObject({
  token: z.string().min(20, 'Verification token is required')
});

export const budgetCreateRequestSchema = strictObject({
  category: categorySchema,
  amountMinor: z.coerce.number().int().min(0, 'Budget amount must be zero or greater').max(100_000_000, 'Budget amount is too large'),
  month: monthKeySchema.optional(),
  currency: z.string().trim().length(3).optional()
});

export const budgetUpdateRequestSchema = strictObject({
  category: categorySchema.optional(),
  amountMinor: z.coerce.number().int().min(0, 'Budget amount must be zero or greater').max(100_000_000, 'Budget amount is too large').optional(),
  currency: z.string().trim().length(3).optional()
}).refine((value) => value.category !== undefined || value.amountMinor !== undefined || value.currency !== undefined, {
  message: 'At least one budget field is required'
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type DocumentUploadMetadata = z.infer<typeof documentUploadMetadataSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema> & { status?: DocumentStatus };
export type CorrectionPayload = z.infer<typeof correctionPayloadSchema>;
export type ExtractionRetryPayload = z.infer<typeof extractionRetrySchema>;
export type DocumentMetadataPatch = z.infer<typeof documentMetadataPatchSchema>;
export type ClaimSubmissionPayload = z.infer<typeof claimSubmissionPayloadSchema>;
export type ClaimListQuery = z.infer<typeof claimListQuerySchema> & { status?: ClaimStatus };
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema> & { status?: ReviewStatus };
export type ReviewApprovePayload = z.infer<typeof reviewApprovePayloadSchema>;
export type ReviewRejectPayload = z.infer<typeof reviewRejectPayloadSchema>;
export type AccountUpdateRequest = z.infer<typeof accountUpdateRequestSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type EmailVerificationConfirmRequest = z.infer<typeof emailVerificationConfirmRequestSchema>;
export type BudgetCreateRequest = z.infer<typeof budgetCreateRequestSchema>;
export type BudgetUpdateRequest = z.infer<typeof budgetUpdateRequestSchema>;
export const createMemberRequestSchema = strictObject({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  displayName: z.string().trim().min(1, 'Display name is required').max(100, 'Display name must not exceed 100 characters'),
  role: z.enum(['staff', 'reviewer', 'admin']).optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type CreateMemberRequest = z.infer<typeof createMemberRequestSchema>;

export const updateMemberRoleRequestSchema = strictObject({
  role: z.enum(['staff', 'reviewer', 'admin']),
});

export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

export const updateMemberRequestSchema = strictObject({
  displayName: z.string().trim().min(1, 'Display name is required').max(100, 'Display name must not exceed 100 characters').optional(),
  email: z.string().email('Invalid email address').optional(),
  role: z.enum(['staff', 'reviewer', 'admin']).optional(),
}).refine((value) => value.displayName !== undefined || value.email !== undefined || value.role !== undefined, {
  message: 'At least one member field is required'
});

export const resetMemberPasswordRequestSchema = strictObject({
  password: passwordSchema,
});

export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
export type ResetMemberPasswordRequest = z.infer<typeof resetMemberPasswordRequestSchema>;
