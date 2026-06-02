import type { Request } from 'express';

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { AuthSecurityAuditService } from '../auth/auth-security-audit.service';
import { requestRouteTemplate } from '../observability/metrics';
import { throwForbidden } from './authorization.errors';
import { AbilityFactory } from './ability.factory';
import type { CurrentActor } from './current-actor';
import { POLICY_HANDLERS_KEY, type PolicyHandler } from './policy.decorator';

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AbilityFactory) private readonly abilityFactory: AbilityFactory,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(POLICY_HANDLERS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (handlers.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const actor = (request as unknown as { user?: CurrentActor }).user;
    if (!actor) throwForbidden();

    const ability = this.abilityFactory.createForActor(actor);
    const allowed = handlers.every((handler) => handler(ability, actor, request));
    if (!allowed) {
      await this.audit.writeSecurityEvent({
        action: SECURITY_AUDIT_ACTIONS.authzDenied,
        actor: { actorId: actor.id, actorRole: actor.role },
        entityId: actor.id,
        message: 'Authorization policy denied request',
        metadata: {
          method: request.method,
          route: requestRouteTemplate(request),
          policyCount: handlers.length
        },
        organizationId: actor.organizationId
      }).catch(() => undefined);
      throwForbidden();
    }

    return true;
  }
}
