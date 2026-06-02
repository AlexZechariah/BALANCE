import { BALANCE_CATEGORIES, CONSUMER_RECORD_TYPES, ENTERPRISE_CLAIM_INTENTS } from '@balance/types';

import { titleCase } from './format';

export const balanceCategories = BALANCE_CATEGORIES;
export const consumerRecordTypes = CONSUMER_RECORD_TYPES;
export const enterpriseClaimIntents = ENTERPRISE_CLAIM_INTENTS;

const categoryLabels: Record<(typeof BALANCE_CATEGORIES)[number], string> = {
  restaurant: 'Restaurant',
  grocery: 'Grocery',
  travel: 'Travel',
  software: 'Software',
  hardware: 'Hardware',
  utilities: 'Utilities',
  transport: 'Transport',
  medical: 'Medical',
  education: 'Education',
  other: 'Other',
};

const recordTypeLabels: Record<(typeof CONSUMER_RECORD_TYPES)[number], string> = {
  tax: 'Tax',
  warranty: 'Warranty',
  return: 'Return',
  personal: 'Personal',
  reimbursement: 'Reimbursement',
};

const legacyRecordTypeLabels: Record<string, string> = {
  receipt: 'Receipt',
  receipt_pdf: 'Receipt PDF',
  invoice: 'Invoice',
  invoice_pdf: 'Invoice PDF',
};

const claimIntentLabels: Record<(typeof ENTERPRISE_CLAIM_INTENTS)[number], string> = {
  reimbursement: 'Reimbursement',
  warranty: 'Warranty',
  tax: 'Tax',
  policy_review: 'Policy Review',
};

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return 'Not Categorized';
  return categoryLabels[value as keyof typeof categoryLabels] ?? titleCase(value);
}

export function recordTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Not Set';
  if (legacyRecordTypeLabels[value]) return legacyRecordTypeLabels[value];
  return recordTypeLabels[value as keyof typeof recordTypeLabels] ?? titleCase(value);
}

export function claimIntentLabel(value: string | null | undefined): string {
  if (!value || value === 'none') return 'Not Decided';
  return claimIntentLabels[value as keyof typeof claimIntentLabels] ?? titleCase(value);
}

export function statusLabel(value: string | null | undefined): string {
  if (!value || value === '-') return 'Not Set';
  return titleCase(value);
}

export function roleLabel(value: string | null | undefined): string {
  if (!value) return 'Member';
  return titleCase(value);
}
