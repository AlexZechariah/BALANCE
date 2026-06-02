import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BALANCE_RATE_LIMIT_POLICY_METADATA, RATE_LIMITS, type RateLimitPolicy } from './rate-limit.constants';

export function BalanceRateLimit(policy: RateLimitPolicy) {
  const limit = RATE_LIMITS[policy];
  return applyDecorators(
    SetMetadata(BALANCE_RATE_LIMIT_POLICY_METADATA, policy),
    Throttle({ default: { limit: limit.limit, ttl: limit.ttl } })
  );
}
