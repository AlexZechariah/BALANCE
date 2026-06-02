import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { ReviewStatus } from '@balance/db';
import {
  reviewApprovePayloadSchema,
  reviewQueueQuerySchema,
  reviewRejectPayloadSchema,
  type ReviewApprovePayload,
  type ReviewQueueQuery,
  type ReviewRejectPayload
} from '@balance/schemas';

import { AuthGuard, type AuthenticatedRequestUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequireVerifiedEmail } from '../auth/verified-email.decorator';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { Actions } from '../authorization/actions';
import { CheckPolicies } from '../authorization/policy.decorator';
import { PolicyGuard } from '../authorization/policy.guard';
import { Subjects } from '../authorization/subjects';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BalanceRateLimit } from '../rate-limit/rate-limit.decorator';

import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get('queue')
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('reviewer', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Review))
  async queue(
    @Query(new ZodValidationPipe(reviewQueueQuerySchema)) query: ReviewQueueQuery,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const status = query.status?.trim();

    const input: { limit: number; offset: number; status?: ReviewStatus; actorId: string; actorRole: string; organizationId: string | null } = {
      limit,
      offset,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId
    };
    if (status) input.status = status as ReviewStatus;
    return this.reviews.listQueue(input);
  }

  @Get('metrics')
  @BalanceRateLimit('metrics')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('reviewer', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Review))
  async metrics(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reviews.metrics({ actorId: user.id, actorRole: user.role, organizationId: user.organizationId });
  }

  @Get(':id')
  @BalanceRateLimit('read')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('reviewer', 'admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Review))
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.reviews.getById({ id, actorId: user.id, actorRole: user.role, organizationId: user.organizationId });
  }

  @Post(':id/claim')
  @BalanceRateLimit('review')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('reviewer', 'admin', 'system_admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.review, Subjects.Review))
  @HttpCode(200)
  async claim(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.reviews.claim({
      reviewId: id,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId
    });
  }

  @Post(':id/assign')
  @BalanceRateLimit('review')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin', 'system_admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.assign, Subjects.Review))
  @HttpCode(200)
  async assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ reviewerId: z.string().uuid() }).strict())) body: { reviewerId: string },
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.reviews.assign({
      reviewId: id,
      reviewerId: body.reviewerId,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId
    });
  }

  @Delete(':id/assign')
  @BalanceRateLimit('review')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin', 'system_admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.assign, Subjects.Review))
  @HttpCode(200)
  async unassign(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.reviews.unassign({
      reviewId: id,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId
    });
  }

  @Post(':id/approve')
  @BalanceRateLimit('review')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin', 'system_admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.approve, Subjects.Review))
  @HttpCode(200)
  async approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewApprovePayloadSchema)) body: ReviewApprovePayload,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.reviews.approve({
      reviewId: id,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      note: body.note ?? null
    });
  }

  @Post(':id/reject')
  @BalanceRateLimit('review')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin', 'system_admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.reject, Subjects.Review))
  @HttpCode(200)
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewRejectPayloadSchema)) body: ReviewRejectPayload,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.reviews.reject({
      reviewId: id,
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      note: body.note
    });
  }
}
