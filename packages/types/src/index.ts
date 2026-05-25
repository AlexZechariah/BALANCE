export type AppEnvironment = 'local' | 'staging' | 'production';
export type StorageDriver = 'filesystem' | 's3';

export const USER_ROLES = ['consumer', 'reviewer', 'staff', 'admin', 'system_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DOCUMENT_STATUSES = [
  'uploaded',
  'queued',
  'processing',
  'extracted',
  'correction_required',
  'corrected',
  'submitted',
  'reviewed',
  'rejected',
  'failed'
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const EXTRACTION_JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type ExtractionJobStatus = (typeof EXTRACTION_JOB_STATUSES)[number];

export const CLAIM_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const REVIEW_STATUSES = ['pending', 'in_review', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ENTITY_TYPES = ['document', 'extraction_job', 'claim', 'review', 'budget'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const EXTRACTION_PROVIDERS = ['textract'] as const;
export type ExtractionProvider = (typeof EXTRACTION_PROVIDERS)[number];

export const BALANCE_CATEGORIES = [
  'restaurant',
  'grocery',
  'travel',
  'software',
  'hardware',
  'utilities',
  'transport',
  'medical',
  'education',
  'other'
] as const;
export type BalanceCategory = (typeof BALANCE_CATEGORIES)[number];

const BALANCE_CATEGORY_SET = new Set<string>(BALANCE_CATEGORIES);

export function normalizeBalanceCategoryValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized.length > 0 ? normalized : null;
}

export function isBalanceCategory(value: unknown): value is BalanceCategory {
  return typeof value === 'string' && BALANCE_CATEGORY_SET.has(value);
}

export function canonicalizeBalanceCategory(value: unknown): BalanceCategory | null {
  const normalized = normalizeBalanceCategoryValue(value);
  return isBalanceCategory(normalized) ? normalized : null;
}

export function canonicalizeBalanceCategoryOrOther(value: unknown): BalanceCategory | null {
  const normalized = normalizeBalanceCategoryValue(value);
  if (!normalized) return null;
  return isBalanceCategory(normalized) ? normalized : 'other';
}

export const CONSUMER_RECORD_TYPES = ['tax', 'warranty', 'return', 'personal', 'reimbursement'] as const;
export type ConsumerRecordType = (typeof CONSUMER_RECORD_TYPES)[number];

export const ENTERPRISE_CLAIM_INTENTS = ['reimbursement', 'warranty', 'tax', 'policy_review'] as const;
export type EnterpriseClaimIntent = (typeof ENTERPRISE_CLAIM_INTENTS)[number];

export const FIELD_NAMES = [
  'merchantName',
  'documentDate',
  'amountMinor',
  'currency',
  'vendorAddress',
  'vendorPhone',
  'vendorTaxId',
  'merchantLegalName',
  'merchantUrl',
  'invoiceReceiptId',
  'receiptId',
  'invoiceId',
  'orderId',
  'receiverName',
  'receiverAddress',
  'customerName',
  'customerAddress',
  'customerEmail',
  'customerPhone',
  'customerTaxId',
  'dueDate',
  'orderDate',
  'invoiceDate',
  'deliveryDate',
  'transactionTime',
  'total',
  'subtotal',
  'tax',
  'taxRate',
  'taxableAmount',
  'amountDue',
  'amountPaid',
  'discount',
  'voucher',
  'shippingCharge',
  'serviceCharge',
  'gratuity',
  'roundingAdjustment',
  'paymentType',
  'paymentCardLast4',
  'paymentReference',
  'paymentTerms',
  'poNumber',
  'cashierName',
  'serverName',
  'tableNumber',
  'coverCount',
  'supplierName',
  'supplierEmail',
  'supplierPhone',
  'supplierWebsite',
  'supplierTaxId',
  'supplierRegistration',
  'remittanceAddress',
  'bankAccount',
  'vendorStreet',
  'vendorCity',
  'vendorState',
  'vendorCountry',
  'vendorPostalCode',
  'receiverStreet',
  'receiverCity',
  'receiverState',
  'receiverCountry',
  'receiverPostalCode',
  'lineItemDescription',
  'lineItemQuantity',
  'lineItemUnit',
  'lineItemUnitPrice',
  'lineItemTotalPrice',
  'lineItemProductCode',
  'lineItemTax',
  'lineItemTaxRate',
  'lineItemDiscount',
  'lineItemCategory',
  'lineItemTransactionDate',
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export const AUDIT_ACTIONS = [
  'document.uploaded',
  'extraction.queued',
  'extraction.started',
  'extraction.completed',
  'extraction.failed',
  'extraction.warning',
  'document.corrected',
  'document.metadata_updated',
  'document.deleted',
  'claim.submitted',
  'claim.resubmitted',
  'claim.recalled',
  'claim.deleted',
  'review.started',
  'review.approved',
  'review.rejected',
  'documents.bulk_deleted',
  'budget.created',
  'budget.updated',
  'budget.deleted',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface BudgetSummary {
  id: string;
  userId: string;
  category: string;
  month: string;
  amountMinor: number;
  actualMinor: number;
  remainingMinor: number;
  currency: string;
  documentCount: number;
  isOverBudget: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategorySpendSummary {
  category: string;
  amountMinor: number;
  count: number;
}

export interface AppConfig {
  appName: string;
  appEnv: AppEnvironment;
  projectSlug: string;
  deploymentNamespace: string;
  appVersion: string;
  gitCommit: string;
  buildId: string;
  webPort: number;
  publicHttpPort: number;
  apiPort: number;
  apiBaseUrl: string;
  apiProxyTarget: string;
  desktopApiBaseUrl: string;
  apiBasePath: string;
  apiHealthPath: string;
  apiVersionPath: string;

  databaseUrl: string;
  redisUrl: string;

  storageDriver: StorageDriver;
  storageFilesystemRoot: string;
  s3Bucket: string;
  s3Region: string;

  jwtSecret: string;
  jwtExpiresIn: string;
  passwordPepper: string;
}

export interface ApiStatusPayload {
  status: 'ok' | 'ready';
  service: 'balance-api';
  app: string;
  environment: AppEnvironment;
  version: string;
}

export interface ApiVersionPayload {
  service: 'balance-api';
  app: string;
  environment: AppEnvironment;
  version: string;
  commit: string;
  build: string;
}
