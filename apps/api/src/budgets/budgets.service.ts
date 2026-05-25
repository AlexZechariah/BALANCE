import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@balance/db';

import { AuditService } from '../audit/audit.service';
import { throwContractHttpError, throwValidationError } from '../common/contract-errors';
import { PrismaService } from '../prisma/prisma.service';

function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonthKey(month?: string): string {
  if (!month) return currentMonthKey();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throwValidationError([{ path: 'month', message: 'Month must use YYYY-MM format' }]);
  }
  return month;
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

function isPrismaKnownErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function monthDateRange(month: string) {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return { start, end };
}

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  private async budgetActuals(userId: string, month: string, categories: string[]) {
    if (categories.length === 0) return new Map<string, { actualMinor: number; documentCount: number }>();
    const { start, end } = monthDateRange(month);

    const documents = await this.prisma.document.findMany({
      where: {
        ownerId: userId,
        category: { in: categories },
        OR: [
          { transactionDate: { startsWith: month } },
          { documentDate: { startsWith: month } },
          {
            AND: [
              { transactionDate: null },
              { documentDate: null },
              { createdAt: { gte: start, lt: end } }
            ]
          }
        ]
      },
      select: { category: true, amountMinor: true }
    });

    const byCategory = new Map<string, { actualMinor: number; documentCount: number }>();
    for (const document of documents) {
      const category = normalizeCategory(document.category ?? 'uncategorized');
      const entry = byCategory.get(category) ?? { actualMinor: 0, documentCount: 0 };
      entry.actualMinor += document.amountMinor ?? 0;
      entry.documentCount += 1;
      byCategory.set(category, entry);
    }
    return byCategory;
  }

  private async mapBudgets(userId: string, budgets: Array<{
    id: string;
    userId: string;
    category: string;
    month: string;
    amountMinor: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }>) {
    const actuals = await this.budgetActuals(userId, budgets[0]?.month ?? currentMonthKey(), budgets.map((budget) => budget.category));
    return budgets.map((budget) => {
      const actual = actuals.get(budget.category) ?? { actualMinor: 0, documentCount: 0 };
      return {
        id: budget.id,
        userId: budget.userId,
        category: budget.category,
        month: budget.month,
        amountMinor: budget.amountMinor,
        actualMinor: actual.actualMinor,
        remainingMinor: budget.amountMinor - actual.actualMinor,
        currency: budget.currency,
        documentCount: actual.documentCount,
        isOverBudget: actual.actualMinor > budget.amountMinor,
        createdAt: budget.createdAt.toISOString(),
        updatedAt: budget.updatedAt.toISOString()
      };
    });
  }

  async list(userId: string, requestedMonth?: string) {
    const month = normalizeMonthKey(requestedMonth);
    const budgets = await this.prisma.budget.findMany({
      where: { userId, month },
      orderBy: { category: 'asc' }
    });

    return {
      month,
      budgets: await this.mapBudgets(userId, budgets)
    };
  }

  async create(userId: string, input: { category: string; amountMinor: number; currency?: string | undefined }) {
    const month = currentMonthKey();
    const category = normalizeCategory(input.category);
    const budget = await this.prisma.budget.create({
      data: {
        userId,
        month,
        category,
        amountMinor: input.amountMinor,
        currency: (input.currency ?? 'MYR').toUpperCase()
      }
    }).catch((error: unknown) => {
      if (isPrismaKnownErrorCode(error, 'P2002')) {
        throwContractHttpError(409, 'CONFLICT', 'A budget already exists for this category this month', []);
      }
      throw error;
    });

    await this.audit.writeEvent({
      action: 'budget.created',
      entityType: 'budget',
      entityId: budget.id,
      actor: { actorId: userId, actorRole: 'consumer' },
      message: 'Budget created',
      metadata: { category: budget.category, month: budget.month, amountMinor: budget.amountMinor } satisfies Prisma.InputJsonValue
    });

    const [mapped] = await this.mapBudgets(userId, [budget]);
    return { budget: mapped };
  }

  async update(userId: string, id: string, input: { category?: string | undefined; amountMinor?: number | undefined; currency?: string | undefined }) {
    const existing = await this.prisma.budget.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId || existing.month !== currentMonthKey()) {
      throwContractHttpError(404, 'NOT_FOUND', 'Budget not found', []);
    }

    const budget = await this.prisma.budget.update({
      where: { id },
      data: {
        ...(input.category !== undefined ? { category: normalizeCategory(input.category) } : {}),
        ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {})
      }
    }).catch((error: unknown) => {
      if (isPrismaKnownErrorCode(error, 'P2002')) {
        throwContractHttpError(409, 'CONFLICT', 'A budget already exists for this category this month', []);
      }
      throw error;
    });

    await this.audit.writeEvent({
      action: 'budget.updated',
      entityType: 'budget',
      entityId: budget.id,
      actor: { actorId: userId, actorRole: 'consumer' },
      message: 'Budget updated',
      metadata: { category: budget.category, month: budget.month, amountMinor: budget.amountMinor } satisfies Prisma.InputJsonValue
    });

    const [mapped] = await this.mapBudgets(userId, [budget]);
    return { budget: mapped };
  }

  async delete(userId: string, id: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget || budget.userId !== userId || budget.month !== currentMonthKey()) {
      throwContractHttpError(404, 'NOT_FOUND', 'Budget not found', []);
    }

    await this.prisma.budget.delete({ where: { id } });

    await this.audit.writeEvent({
      action: 'budget.deleted',
      entityType: 'budget',
      entityId: budget.id,
      actor: { actorId: userId, actorRole: 'consumer' },
      message: 'Budget deleted',
      metadata: { category: budget.category, month: budget.month, amountMinor: budget.amountMinor } satisfies Prisma.InputJsonValue
    });

    return { ok: true };
  }
}
