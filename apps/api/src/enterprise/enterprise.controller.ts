import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  claimListQuerySchema,
  createMemberRequestSchema,
  documentListQuerySchema,
  resetMemberPasswordRequestSchema,
  updateMemberRequestSchema,
  updateMemberRoleRequestSchema,
  type ClaimListQuery,
  type CreateMemberRequest,
  type DocumentListQuery,
  type ResetMemberPasswordRequest,
  type UpdateMemberRequest,
  type UpdateMemberRoleRequest
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

import { EnterpriseService } from './enterprise.service';

@Controller('enterprise')
export class EnterpriseController {
  constructor(@Inject(EnterpriseService) private readonly enterprise: EnterpriseService) {}

  @Post('members')
  @BalanceRateLimit('membership')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.create, Subjects.Membership))
  @HttpCode(201)
  async createMember(
    @Body(new ZodValidationPipe(createMemberRequestSchema)) body: CreateMemberRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.enterprise.createMember(user.id, body.email, body.password, body.displayName, body.role ?? 'staff');
  }

  @Get('members')
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Membership))
  async listMembers(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.enterprise.listMembers(user.id);
  }

  @Get('claims')
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('admin', 'reviewer', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Claim))
  async listClaims(
    @Query(new ZodValidationPipe(claimListQuerySchema)) query: ClaimListQuery,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const input: Parameters<typeof this.enterprise.listClaims>[0] = {
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0
    };
    if (query.status) input.status = query.status.trim();
    return this.enterprise.listClaims(input);
  }

  @Get('documents')
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async listDocuments(
    @Query(new ZodValidationPipe(documentListQuerySchema)) query: DocumentListQuery,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    const cleanedQuery: Parameters<typeof this.enterprise.listDocuments>[0]['query'] = {};
    if (query.limit != null) cleanedQuery.limit = query.limit;
    if (query.offset != null) cleanedQuery.offset = query.offset;
    if (query.status) cleanedQuery.status = query.status;
    if (query.search) cleanedQuery.search = query.search;
    if (query.category) cleanedQuery.category = query.category;
    if (query.from) cleanedQuery.from = query.from;
    if (query.to) cleanedQuery.to = query.to;
    if (query.minAmount != null) cleanedQuery.minAmount = query.minAmount;
    if (query.maxAmount != null) cleanedQuery.maxAmount = query.maxAmount;

    return this.enterprise.listDocuments({
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      query: cleanedQuery
    });
  }

  @Get('documents/:id')
  @BalanceRateLimit('read')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('admin', 'system_admin')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Document))
  async documentDetail(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.enterprise.getDocumentOwner({
      actorId: user.id,
      actorRole: user.role,
      organizationId: user.organizationId,
      documentId: id
    });
  }

  @Delete('members/:id')
  @BalanceRateLimit('membership')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.delete, Subjects.Membership))
  @HttpCode(200)
  async deleteMember(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.enterprise.deleteMember(user.id, id);
  }

  @Patch('members/:id/role')
  @BalanceRateLimit('membership')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.Membership))
  @HttpCode(200)
  async updateMemberRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberRoleRequestSchema)) body: UpdateMemberRoleRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.enterprise.updateMemberRole(user.id, id, body.role);
  }

  @Patch('members/:id')
  @BalanceRateLimit('membership')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.Membership))
  @HttpCode(200)
  async updateMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberRequestSchema)) body: UpdateMemberRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.enterprise.updateMember(user.id, id, body);
  }

  @Patch('members/:id/password')
  @BalanceRateLimit('membership')
  @UseGuards(AuthGuard, RolesGuard, VerifiedEmailGuard, PolicyGuard)
  @Roles('admin')
  @RequireVerifiedEmail()
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.Membership))
  @HttpCode(200)
  async resetMemberPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetMemberPasswordRequestSchema)) body: ResetMemberPasswordRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.enterprise.resetMemberPassword(user.id, id, body.password);
  }
}
