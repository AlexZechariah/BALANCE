import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from '../audit/audit.module';

import { BalanceRateLimitGuard } from './rate-limit.guard';
import { RATE_LIMITS } from './rate-limit.constants';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        limit: RATE_LIMITS.default.limit,
        ttl: RATE_LIMITS.default.ttl
      }
    ]),
    AuditModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: BalanceRateLimitGuard
    }
  ]
})
export class RateLimitModule {}
