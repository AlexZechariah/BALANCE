import type { Request } from 'express';

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { throwContractHttpError } from '../common/contract-errors';
import { requestRouteTemplate } from '../observability/metrics';
import type { AuthenticatedRequestUser } from './auth.guard';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { VERIFIED_EMAIL_ROLES_KEY } from './verified-email.decorator';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(VERIFIED_EMAIL_ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (roles === undefined) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedRequestUser }>();
    const user = request.user;
    if (!user) {
      throwContractHttpError(403, 'AUTH_EMAIL_VERIFICATION_REQUIRED', 'Verified email is required', []);
    }

    const appliesToRole = roles.length === 0 || roles.includes(user.role);
    if (!appliesToRole || user.emailVerifiedAt) return true;

    void this.audit.writeSecurityEvent({
      action: SECURITY_AUDIT_ACTIONS.authzDenied,
      actor: { actorId: user.id, actorRole: user.role },
      entityId: user.id,
      message: 'Verified email required',
      metadata: {
        reason: 'email_verification_required',
        method: request.method,
        route: requestRouteTemplate(request)
      },
      organizationId: user.organizationId
    }).catch(() => undefined);

    throwContractHttpError(403, 'AUTH_EMAIL_VERIFICATION_REQUIRED', 'Verified email is required', []);
  }
}
