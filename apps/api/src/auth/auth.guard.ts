import type { Request } from 'express';

import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import { SECURITY_AUDIT_ACTIONS } from '../audit/audit-event.constants';
import { throwContractHttpError } from '../common/contract-errors';
import { apiMetrics, requestRouteTemplate } from '../observability/metrics';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { CSRF_HEADER_NAME, MUTATING_HTTP_METHODS } from './session.constants';
import { SessionCookieService } from './session-cookie.service';
import { SessionService } from './session.service';

export type AuthenticatedRequestUser = {
  id: string;
  role: string;
  email: string;
  organizationId: string | null;
  emailVerifiedAt: Date | null;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SessionCookieService) private readonly cookies: SessionCookieService,
    @Inject(AuthSecurityAuditService) private readonly audit: AuthSecurityAuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const sessionToken = this.cookies.sessionTokenFromRequest(request);
    if (!sessionToken) {
      apiMetrics.recordAuthFailure('AUTH_REQUIRED');
      throwContractHttpError(401, 'AUTH_REQUIRED', 'Authentication required', []);
    }

    let session: Awaited<ReturnType<SessionService['validateSession']>>;
    try {
      session = await this.sessions.validateSession(sessionToken);
    } catch (error) {
      apiMetrics.recordAuthFailure('AUTH_INVALID_TOKEN');
      throw error;
    }

    if (MUTATING_HTTP_METHODS.has(request.method.toUpperCase())) {
      const header = request.headers[CSRF_HEADER_NAME];
      const submittedToken = Array.isArray(header) ? header[0] : header;
      try {
        this.sessions.validateCsrf(session, submittedToken);
      } catch (error) {
        apiMetrics.recordAuthFailure('CSRF_REQUIRED');
        void this.audit.writeSecurityEvent({
          action: SECURITY_AUDIT_ACTIONS.authCsrfFailed,
          actor: { actorId: session.user.id, actorRole: session.user.role },
          entityId: session.user.id,
          message: 'CSRF validation failed',
          metadata: {
            method: request.method,
            route: requestRouteTemplate(request)
          },
          organizationId: session.user.organizationId
        }).catch(() => undefined);
        throw error;
      }
    }

    (request as unknown as { user: AuthenticatedRequestUser }).user = session.user;
    return true;
  }
}
