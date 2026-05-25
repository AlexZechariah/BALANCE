'use client';

import Link from 'next/link';
import { type ElementType, useEffect, useState } from 'react';
import { Clock, FileText, Tags, TrendingUp } from 'lucide-react';

import { ConsumerLayout } from '@/components/consumer-layout';
import { RouteGuard } from '@/components/route-guard';
import { SpendBarChart } from '@/components/charts/spend-bar-chart';
import { PageTransition } from '@/components/workspace/page-transition';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDocumentInsights, type DocumentInsights } from '@/lib/api/documents';
import { BalanceApiError } from '@/lib/api/client';
import { categoryLabel, recordTypeLabel } from '@/lib/display-labels';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';

export default function ConsumerInsightsPage() {
  return (
    <RouteGuard allowedRoles={['consumer', 'staff', 'admin']}>
      <ConsumerLayout>
        <InsightsContent />
      </ConsumerLayout>
    </RouteGuard>
  );
}

function InsightsContent() {
  const [insights, setInsights] = useState<DocumentInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocumentInsights()
      .then((response) => setInsights(response.insights))
      .catch((err) => setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load insights.'));
  }, []);

  return (
    <PageTransition>
      <div className="grid gap-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Spend evidence</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Insights</h1>
          </div>
          {insights?.lastUpdatedAt && (
            <Badge variant="neutral">
              <Clock className="size-3" />
              Updated {formatDateTime(insights.lastUpdatedAt)}
            </Badge>
          )}
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {!insights ? (
          <div className="grid gap-4">
            <Skeleton className="h-80" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-56" />
              <Skeleton className="h-56" />
              <Skeleton className="h-56" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Total Captured" value={formatMoney(insights.summary.totalAmountMinor)} detail={`${formatNumber(insights.summary.totalDocuments)} documents`} icon={FileText} />
              <Metric label="This Month" value={formatMoney(insights.currentMonthSpendMinor)} detail={`${formatNumber(insights.currentMonthDocumentCount)} documents`} icon={TrendingUp} />
              <Metric label="Tax and Service" value={formatMoney(insights.totalTaxMinor + insights.totalServiceChargeMinor)} detail={`${formatMoney(insights.totalDiscountMinor)} discounts`} icon={Tags} />
              <Metric label="Needs Attention" value={formatNumber(insights.summary.needsReviewCount + insights.summary.failedCount)} detail="Review or retry extraction" icon={Clock} />
            </div>

            <Card variant="panel">
              <CardHeader>
                <CardTitle>Monthly Trend</CardTitle>
                <p className="text-sm text-muted-foreground">Amounts stay in minor units from the API and are formatted only at render time.</p>
              </CardHeader>
              <CardContent>
                <SpendBarChart data={insights.monthlySpend} height={320} />
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-3">
              <Breakdown title="Categories" rows={insights.categorySpend.map((item) => ({ label: categoryLabel(item.category), amountMinor: item.amountMinor, count: item.count }))} />
              <Breakdown title="Merchants" rows={insights.merchantSpend.map((item) => ({ label: item.merchantName, amountMinor: item.amountMinor, count: item.count }))} />
              <Breakdown title="Record Types" rows={insights.recordTypeSpend.map((item) => ({ label: recordTypeLabel(item.recordType), amountMinor: item.amountMinor, count: item.count }))} />
            </div>

            <Card variant="surface">
              <CardHeader>
                <CardTitle>Recent Documents</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {insights.recentDocuments.map((document) => (
                  <Link key={document.id} href={`/app/documents/${document.id}`} className="grid gap-2 rounded-md border border-border bg-background/60 px-3 py-3 hover:bg-muted md:grid-cols-[1fr_auto]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{document.merchantName ?? document.originalFilename}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(document.updatedAt)} · {categoryLabel(document.category ?? 'uncategorized')}</span>
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">{formatMoney(document.amountMinor, document.currency ?? 'MYR')}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: ElementType }) {
  return (
    <Card variant="surface">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="size-4 text-primary" />
        </div>
        <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; amountMinor: number; count: number }> }) {
  return (
    <Card variant="surface">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.slice(0, 8).map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border bg-background/60 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm">{row.label}</span>
              <span className="text-xs text-muted-foreground">{formatNumber(row.count)} document{row.count === 1 ? '' : 's'}</span>
            </span>
            <span className="font-mono text-sm tabular-nums">{formatMoney(row.amountMinor)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No data captured yet.</p>}
      </CardContent>
    </Card>
  );
}
