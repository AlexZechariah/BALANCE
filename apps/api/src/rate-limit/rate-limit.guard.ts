import type { Request } from 'express';

import { ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage
} from '@nestjs/throttler';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { SecurityAuditService } from '../audit/security-audit.service';
import type { AuthenticatedRequestUser } from '../auth/auth.guard';
import { apiMetrics, requestRouteTemplate } from '../observability/metrics';

import { BALANCE_RATE_LIMIT_POLICY_METADATA, type RateLimitPolicy } from './rate-limit.constants';

@Injectable()
export class BalanceRateLimitGuard extends ThrottlerGuard {
  private readonly logger = new Logger(BalanceRateLimitGuard.name);

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(SecurityAuditService) private readonly audit: SecurityAuditService
  ) {
    super(options, storageService, reflector);
    this.localReflector = reflector;
  }

  private readonly localReflector: Reflector;

  protected override async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedRequestUser }>();
    const policy = this.localReflector.getAllAndOverride<RateLimitPolicy | undefined>(BALANCE_RATE_LIMIT_POLICY_METADATA, [
      context.getHandler(),
      context.getClass()
    ]);
    const user = request.user;
    apiMetrics.recordRateLimit(policy ?? 'default');

    void this.audit.writeSecurityEvent({
      action: SECURITY_AUDIT_ACTIONS.rateLimitTriggered,
      entityId: policy ?? 'default',
      actor: {
        actorId: user?.id ?? null,
        actorRole: user?.role ?? 'anonymous'
      },
      message: 'Rate limit triggered',
      metadata: {
        policy: policy ?? 'default',
        method: request.method,
        route: requestRouteTemplate(request),
        limit: detail.limit,
        ttl: detail.ttl
      },
      organizationId: user?.organizationId ?? null
    }).catch((err: unknown) => {
      this.logger.warn(`Failed to write rate-limit audit event: ${err instanceof Error ? err.name : 'unknown'}`);
    });

    await super.throwThrottlingException(context, detail);
  }
}
