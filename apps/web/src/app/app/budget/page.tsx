'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Save, Trash2, WalletCards } from 'lucide-react';

import { ConsumerLayout } from '@/components/consumer-layout';
import { RouteGuard } from '@/components/route-guard';
import { PageTransition } from '@/components/workspace/page-transition';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  alertDialogActionClassName,
  alertDialogCancelClassName,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createBudget, deleteBudget, listBudgets, updateBudget, type Budget } from '@/lib/api/budgets';
import { BalanceApiError } from '@/lib/api/client';
import { getDocumentInsights, type DocumentInsights } from '@/lib/api/documents';
import { balanceCategories, categoryLabel } from '@/lib/display-labels';
import { formatMoney } from '@/lib/format';

export default function ConsumerBudgetPage() {
  return (
    <RouteGuard allowedRoles={['consumer']}>
      <ConsumerLayout>
        <BudgetContent />
      </ConsumerLayout>
    </RouteGuard>
  );
}

function BudgetContent() {
  const [month, setMonth] = useState('');
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [category, setCategory] = useState('restaurant');
  const [categorySpend, setCategorySpend] = useState<DocumentInsights['categorySpend']>([]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);

  async function load(nextMonth?: string) {
    setLoading(true);
    setError(null);
    try {
      const [response, insightsResponse] = await Promise.all([
        listBudgets(nextMonth || undefined),
        getDocumentInsights(),
      ]);
      setMonth(response.month);
      setBudgets(response.budgets);
      setCategorySpend(insightsResponse.insights.categorySpend);
    } catch (err) {
      setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load budgets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addBudget(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const parsed = Math.round(Number(amount) * 100);
    if (!category) { setError('Category is required.'); return; }
    if (!Number.isFinite(parsed) || parsed < 0) { setError('Enter a valid monthly budget amount.'); return; }

    setSaving(true);
    try {
      const response = await createBudget({ category, amountMinor: parsed });
      setBudgets((items) => [...items.filter((item) => item.id !== response.budget.id), response.budget].sort((a, b) => a.category.localeCompare(b.category)));
      setCategory('restaurant');
      setAmount('');
      setNotice('Budget added.');
    } catch (err) {
      setError(err instanceof BalanceApiError ? err.error.message : 'Failed to add budget.');
    } finally {
      setSaving(false);
    }
  }

  async function saveBudget(budget: Budget, nextAmount: string) {
    const parsed = Math.round(Number(nextAmount) * 100);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a valid monthly budget amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await updateBudget(budget.id, { amountMinor: parsed });
      setBudgets((items) => items.map((item) => item.id === budget.id ? response.budget : item));
      setNotice('Budget updated.');
    } catch (err) {
      setError(err instanceof BalanceApiError ? err.error.message : 'Failed to update budget.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBudget(deleteTarget.id);
      setBudgets((items) => items.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice('Budget deleted.');
    } catch (err) {
      setError(err instanceof BalanceApiError ? err.error.message : 'Failed to delete budget.');
    } finally {
      setSaving(false);
    }
  }

  const totalBudgetMinor = budgets.reduce((sum, budget) => sum + budget.amountMinor, 0);
  const totalActualMinor = budgets.reduce((sum, budget) => sum + budget.actualMinor, 0);
  const remainingMinor = totalBudgetMinor - totalActualMinor;
  const overBudgetMinor = budgets.reduce((sum, budget) => sum + (budget.remainingMinor < 0 ? Math.abs(budget.remainingMinor) : 0), 0);
  const budgetedCategories = new Set(budgets.map((budget) => budget.category));
  const unbudgetedCategories = categorySpend.filter((item) => item.amountMinor > 0 && !budgetedCategories.has(item.category));
  const unbudgetedMinor = unbudgetedCategories.reduce((sum, item) => sum + item.amountMinor, 0);
  const monthLabel = formatBudgetMonth(month);

  return (
    <PageTransition>
      <div className="grid gap-6">
        <div>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Budget</h1>
        </div>

        {notice && <Alert variant="success">{notice}</Alert>}
        {error && <Alert role="alert" variant="destructive">{error}</Alert>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Budgeted" value={formatMoney(totalBudgetMinor)} />
          <Metric label="Captured Spend" value={formatMoney(totalActualMinor)} />
          <Metric label="Remaining" value={formatMoney(remainingMinor)} />
          <Metric label="Over Budget" value={formatMoney(overBudgetMinor)} tone={overBudgetMinor > 0 ? 'danger' : 'neutral'} />
          <Metric label="Unbudgeted Spend" value={formatMoney(unbudgetedMinor)} tone={unbudgetedMinor > 0 ? 'warning' : 'neutral'} />
        </div>

        <Card variant="panel">
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>Add Category Budget</CardTitle>
                <p className="text-sm text-muted-foreground">Budgets are scoped to {monthLabel}.</p>
              </div>
              <div className="w-full sm:w-44">
                <Label htmlFor="budgetMonth" className="sr-only">Budget month</Label>
                <Input
                  id="budgetMonth"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    const nextMonth = event.target.value;
                    setMonth(nextMonth);
                    void load(nextMonth);
                  }}
                  disabled={loading || saving}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={addBudget} className="grid gap-3 md:grid-cols-[1fr_12rem_auto] md:items-end">
              <div>
                <Label htmlFor="budgetCategory">Category</Label>
                <Select value={category} onValueChange={setCategory} disabled={saving}>
                  <SelectTrigger id="budgetCategory"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {balanceCategories.map((value) => (
                      <SelectItem key={value} value={value} disabled={budgetedCategories.has(value)}>{categoryLabel(value)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="budgetAmount">Amount</Label>
                <Input id="budgetAmount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="250.00" disabled={saving} />
              </div>
              <Button type="submit" disabled={saving}>
                <Plus className="size-4" />
                Add
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {loading && <Card><CardContent className="p-5 text-sm text-muted-foreground">Loading budgets...</CardContent></Card>}
          {!loading && budgets.length === 0 && (
            <Card variant="surface">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <WalletCards className="size-8" />
                Add a {monthLabel} category budget to compare captured receipts against your plan.
              </CardContent>
            </Card>
          )}
          {budgets.map((budget) => (
            <BudgetRow key={budget.id} budget={budget} saving={saving} onSave={saveBudget} onDelete={setDeleteTarget} />
          ))}
        </div>

        {unbudgetedCategories.length > 0 && (
          <Card variant="surface">
            <CardHeader>
              <CardTitle>Unbudgeted Categories</CardTitle>
              <p className="text-sm text-muted-foreground">These categories have captured spend but no budget yet.</p>
            </CardHeader>
            <CardContent className="grid gap-2">
              {unbudgetedCategories.slice(0, 5).map((item) => (
                <div key={item.category} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{categoryLabel(item.category)}</p>
                    <p className="text-xs text-muted-foreground">{item.count} document{item.count === 1 ? '' : 's'}</p>
                  </div>
                  <span className="font-mono tabular-nums">{formatMoney(item.amountMinor)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete budget?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {deleteTarget ? categoryLabel(deleteTarget.category) : ''} budget for the current month. Captured documents are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={alertDialogCancelClassName}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={alertDialogActionClassName} onClick={() => void confirmDelete()}>
              Delete budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}

function formatBudgetMonth(month: string): string {
  if (!month) return 'Current Month';
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'warning' | 'danger' }) {
  return (
    <Card variant="surface">
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function BudgetRow({ budget, saving, onSave, onDelete }: {
  budget: Budget;
  saving: boolean;
  onSave: (budget: Budget, amount: string) => void;
  onDelete: (budget: Budget) => void;
}) {
  const [amount, setAmount] = useState(String((budget.amountMinor / 100).toFixed(2)));
  const progress = budget.amountMinor === 0 ? 100 : Math.min(100, Math.round((budget.actualMinor / budget.amountMinor) * 100));

  useEffect(() => {
    setAmount(String((budget.amountMinor / 100).toFixed(2)));
  }, [budget.amountMinor]);

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card variant="surface">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_12rem_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{categoryLabel(budget.category)}</p>
              {budget.isOverBudget && <Badge variant="danger">Over budget</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMoney(budget.actualMinor, budget.currency)} spent of {formatMoney(budget.amountMinor, budget.currency)} · {budget.documentCount} document{budget.documentCount === 1 ? '' : 's'} · {budget.remainingMinor < 0 ? `${formatMoney(Math.abs(budget.remainingMinor), budget.currency)} over` : `${formatMoney(budget.remainingMinor, budget.currency)} remaining`}
            </p>
            <Progress className="mt-3" value={progress} />
          </div>
          <div>
            <Label htmlFor={`budget-${budget.id}`} className="sr-only">Budget amount</Label>
            <Input id={`budget-${budget.id}`} value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} inputMode="decimal" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onSave(budget, amount)} disabled={saving}>
              <Save className="size-4" />
              Save
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${budget.category} budget`} onClick={() => onDelete(budget)} disabled={saving}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
