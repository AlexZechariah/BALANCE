import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBudget, listBudgets } from './budgets';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('budget api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads budgets for the selected month', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      month: '2026-05',
      budgets: [],
      unbudgetedCategories: []
    }));

    await expect(listBudgets('2026-05')).resolves.toMatchObject({ month: '2026-05' });

    expect(fetchSpy).toHaveBeenCalledWith('/api/budgets?month=2026-05', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' }
    }));
  });

  it('sends the selected month when creating a budget', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      budget: {
        id: 'budget-1',
        userId: 'user-1',
        category: 'restaurant',
        month: '2026-05',
        amountMinor: 25000,
        actualMinor: 0,
        remainingMinor: 25000,
        currency: 'MYR',
        documentCount: 0,
        isOverBudget: false,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      }
    }));

    await createBudget({ category: 'restaurant', amountMinor: 25000, month: '2026-05' });

    expect(fetchSpy).toHaveBeenCalledWith('/api/budgets', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ category: 'restaurant', amountMinor: 25000, month: '2026-05' }),
      headers: { 'Content-Type': 'application/json' }
    }));
  });
});
