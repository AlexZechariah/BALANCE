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
import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { BudgetsService } from './budgets.service';

@Controller('budgets')
export class BudgetsController {
  constructor(@Inject(BudgetsService) private readonly budgets: BudgetsService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer')
  async list(@CurrentUser() user: AuthenticatedRequestUser, @Query('month') month?: string) {
    return this.budgets.list(user.id, month);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer')
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(budgetCreateRequestSchema)) body: BudgetCreateRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.budgets.create(user.id, body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(budgetUpdateRequestSchema)) body: BudgetUpdateRequest,
    @CurrentUser() user: AuthenticatedRequestUser
  ) {
    return this.budgets.update(user.id, id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('consumer')
  @HttpCode(200)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedRequestUser) {
    return this.budgets.delete(user.id, id);
  }
}
