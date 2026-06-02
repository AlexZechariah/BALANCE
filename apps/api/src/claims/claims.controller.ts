import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { ClaimStatus } from '@balance/db';
import {
  claimListQuerySchema,
  claimSubmissionPayloadSchema,
  type ClaimListQuery,
  type ClaimSubmissionPayload
} from '@balance/schemas';

import { AuthGuard, type AuthenticatedRequestUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequireVerifiedEmail, RequireVerifiedEmailForRoles } from '../auth/verified-email.decorator';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { Actions } from '../authorization/actions';
import { CheckPolicies } from '../authorization/policy.decorator';
import { PolicyGuard } from '../authorization/policy.guard';
import { Subjects } from '../authorization/subjects';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BalanceRateLimit } from '../rate-limit/rate-limit.decorator';

import { ClaimsService } from './claims.service';

@Controller('claims')
export class ClaimsController {
  constructor(@Inject(ClaimsService) private readonly claims: ClaimsService) {}

  @Post()
  @BalanceRateLimit('claim')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.submit, Subjects.Claim))
  async create(
    @Body(new ZodValidationPipe(claimSubmissionPayloadSchema)) body: ClaimSubmissionPayload,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.claims.create({
      consumerId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      documentId: body.documentId,
      purpose: body.purpose,
      note: body.note ?? null
    });
  }

  @Get()
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Claim))
  async list(
    @Query(new ZodValidationPipe(claimListQuerySchema)) query: ClaimListQuery,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const status = query.status?.trim();

    const input: { consumerId: string; limit: number; offset: number; status?: ClaimStatus } = {
      consumerId: user.id,
      limit,
      offset
    };

    if (status) {
      input.status = status as ClaimStatus;
    }

    return this.claims.list(input);
  }

  @Get('insights')
  @BalanceRateLimit('insights')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'staff', 'admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Claim))
  async insights(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.claims.insights({ consumerId: user.id });
  }

  @Post(':id/recall')
  @BalanceRateLimit('claim')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('staff', 'admin', 'system_admin')
  @RequireVerifiedEmailForRoles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.Claim))
  @HttpCode(200)
  async recall(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.claims.recall({
      claimId: id,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId
    });
  }

  @Get(':id')
  @BalanceRateLimit('read')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer', 'reviewer', 'staff', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Claim))
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.claims.getById({ id, userId: user.id, role: user.role, organizationId: user.organizationId });
  }
}
