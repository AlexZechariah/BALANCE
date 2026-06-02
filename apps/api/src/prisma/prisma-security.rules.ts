export const unsafeRawSqlApis = ['$queryRawUnsafe', '$executeRawUnsafe'] as const;

export const reviewedRawSqlReasons = ['readiness-check'] as const;

export const PRISMA_SECURITY_RULES = {
  unsafeRawSqlApis,
  reviewedRawSqlReasons,
  transactionRequiredFor: [
    'auth session revocation',
    'password reset completion',
    'email verification completion',
    'document delete',
    'extraction retry',
    'claim submission',
    'review assignment',
    'review approval',
    'review rejection',
    'membership role change'
  ],
  sensitiveSelectsRequiredFor: [
    'user account responses',
    'auth sessions',
    'account tokens',
    'document detail',
    'claim detail',
    'review detail',
    'audit events',
    'organization membership'
  ]
} as const;
