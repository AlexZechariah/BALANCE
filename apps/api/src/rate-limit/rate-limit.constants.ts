export const BALANCE_RATE_LIMIT_POLICY_METADATA = 'balance:rate-limit-policy';

export const RATE_LIMITS = {
  default: { limit: 1000, ttl: 60_000 },
  auth: { limit: 30, ttl: 60_000 },
  read: { limit: 300, ttl: 60_000 },
  list: { limit: 180, ttl: 60_000 },
  insights: { limit: 90, ttl: 60_000 },
  metrics: { limit: 120, ttl: 60_000 },
  upload: { limit: 20, ttl: 60_000 },
  preview: { limit: 180, ttl: 60_000 },
  retry: { limit: 10, ttl: 60 * 60_000 },
  claim: { limit: 60, ttl: 60_000 },
  review: { limit: 60, ttl: 60_000 },
  membership: { limit: 30, ttl: 60_000 },
  audit: { limit: 120, ttl: 60_000 },
  sensitive: { limit: 30, ttl: 60_000 }
} as const;

export type RateLimitPolicy = keyof typeof RATE_LIMITS;
