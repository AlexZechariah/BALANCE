import type { BudgetSummary } from '@balance/types';
import { apiRequest } from './client';

export type Budget = BudgetSummary;

export async function listBudgets(month?: string): Promise<{ month: string; budgets: Budget[] }> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  return apiRequest(`/budgets${qs}`);
}

export async function createBudget(input: {
  category: string;
  amountMinor: number;
  currency?: string;
}): Promise<{ budget: Budget }> {
  return apiRequest('/budgets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateBudget(
  id: string,
  input: { category?: string; amountMinor?: number; currency?: string },
): Promise<{ budget: Budget }> {
  return apiRequest(`/budgets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteBudget(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/budgets/${id}`, { method: 'DELETE' });
}
