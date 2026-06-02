import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  budgetCreateRequestSchema,
  budgetUpdateRequestSchema,
  type BudgetCreateRequest,
  type BudgetUpdateRequest
} from '@balance/schemas';

import { AuthGuard, type AuthenticatedRequestUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Actions } from '../authorization/actions';
import { CheckPolicies } from '../authorization/policy.decorator';
import { PolicyGuard } from '../authorization/policy.guard';
import { Subjects } from '../authorization/subjects';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BalanceRateLimit } from '../rate-limit/rate-limit.decorator';

import { BudgetsService } from './budgets.service';

@Controller('budgets')
export class BudgetsController {
  constructor(@Inject(BudgetsService) private readonly budgets: BudgetsService) {}

  @Get()
  @BalanceRateLimit('list')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer')
  @CheckPolicies((ability) => ability.can(Actions.read, Subjects.Budget))
  async list(@CurrentUser() user: AuthenticatedRequestUser, @Query('month') month?: string) {
    return this.budgets.list(user.id, month);
  }

  @Post()
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer')
  @CheckPolicies((ability) => ability.can(Actions.create, Subjects.Budget))
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(budgetCreateRequestSchema)) body: BudgetCreateRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.budgets.create(user.id, body);
  }

  @Patch(':id')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer')
  @CheckPolicies((ability) => ability.can(Actions.update, Subjects.Budget))
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(budgetUpdateRequestSchema)) body: BudgetUpdateRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.budgets.update(user.id, id, body);
  }

  @Delete(':id')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard, RolesGuard, PolicyGuard)
  @Roles('consumer')
  @CheckPolicies((ability) => ability.can(Actions.delete, Subjects.Budget))
  @HttpCode(200)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.budgets.delete(user.id, id);
  }
}
