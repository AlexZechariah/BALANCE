'use client';

import Link from 'next/link';
import { type ElementType, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CircleAlert, FileClock, Files, Search, TrendingUp, UploadCloud, WalletCards } from 'lucide-react';

import { RouteGuard } from '../../components/route-guard';
import { ConsumerLayout } from '../../components/consumer-layout';
import { useAuth } from '../../context/auth-context';
import { getDocumentInsights, type DocumentInsights } from '@/lib/api/documents';
import { BalanceApiError } from '@/lib/api/client';
import { categoryLabel } from '@/lib/display-labels';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SpendBarChart } from '@/components/charts/spend-bar-chart';
import { PageTransition } from '@/components/workspace/page-transition';

export default function AppDashboard() {
  return (
    <RouteGuard allowedRoles={['consumer', 'staff', 'admin']}>
      <ConsumerLayout>
        <DashboardContent />
      </ConsumerLayout>
    </RouteGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<DocumentInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocumentInsights()
      .then((documents) => setInsights(documents.insights))
      .catch((err) => {
        setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load document insights.');
      });
  }, []);

  return (
    <PageTransition>
      <div className="grid gap-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome, {user?.displayName}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/app/documents">
                <Search className="size-4" />
                Search Documents
              </Link>
            </Button>
            <Button asChild>
              <Link href="/app/documents/upload">
                <UploadCloud className="size-4" />
                Upload
              </Link>
            </Button>
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {!insights ? (
          <div className="grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1.2fr_1fr_1fr]"
          >
            <MetricCard icon={WalletCards} label="This Month" value={formatMoney(insights.currentMonthSpendMinor)} detail={`${formatPercent(insights.monthOverMonthChange)} vs previous month`} size="large" />
            <MetricCard icon={Files} label="Receipts This Month" value={formatNumber(insights.currentMonthDocumentCount)} detail={`${formatMoney(insights.averageReceiptMinor)} average receipt`} size="large" />
            <MetricCard icon={FileClock} label="Needs Review" value={formatNumber(insights.summary.needsReviewCount + insights.summary.failedCount)} detail={`${formatNumber(insights.summary.processingCount)} still processing`} />
            <MetricCard icon={TrendingUp} label="Record-ready" value={formatMoney(insights.summary.claimableAmountMinor)} detail="Extracted or corrected documents" />
          </motion.div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <Card variant="panel">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Monthly Spending</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Receipt records grouped by transaction or upload month.</p>
              </div>
              <Badge variant="neutral">MYR</Badge>
            </CardHeader>
            <CardContent>
              {insights && !error ? <SpendBarChart data={insights.monthlySpend} /> : <Skeleton className="h-[280px] min-w-0" />}
            </CardContent>
          </Card>

          <Card variant="surface">
            <CardHeader>
              <CardTitle>Record Readiness</CardTitle>
              <p className="text-sm text-muted-foreground">Actionable extraction and filing signals.</p>
            </CardHeader>
            <CardContent className="grid gap-3">
              {insights ? (
                <>
                  <QueueLine label="Review extracted values" value={insights.statusCounts.correction_required ?? 0} href="/app/documents" />
                  <QueueLine label="Retry failed extraction" value={insights.statusCounts.failed ?? 0} href="/app/documents" />
                  <QueueLine label="Open spend insights" value={insights.categorySpend.length} href="/app/insights" />
                  <QueueLine label="Check budgets" value={insights.recordTypeSpend.length} href="/app/budget" />
                </>
              ) : (
                <Skeleton className="h-32" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card variant="surface">
            <CardHeader>
              <CardTitle>Top Spend Categories</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {(insights?.categorySpend.slice(0, 6) ?? []).map((category) => (
                <Link key={category.category} href="/app/insights" className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border bg-background/60 px-3 py-2 hover:bg-muted">
                  <span className="truncate text-sm">{categoryLabel(category.category)}</span>
                  <span className="font-mono text-sm tabular-nums">{formatMoney(category.amountMinor)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card variant="surface">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent Activity</CardTitle>
              {insights?.lastUpdatedAt && <span className="text-xs text-muted-foreground">Updated {formatDateTime(insights.lastUpdatedAt)}</span>}
            </CardHeader>
            <CardContent className="grid gap-2">
              {(insights?.recentDocuments.slice(0, 6) ?? []).map((document) => (
                <Link key={document.id} href={`/app/documents/${document.id}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border bg-background/60 px-3 py-2 text-sm hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block truncate">{document.merchantName ?? document.originalFilename}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(document.updatedAt)}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{formatMoney(document.amountMinor, document.currency ?? 'MYR')}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}

function MetricCard({ icon: Icon, label, value, detail, size }: { icon: ElementType; label: string; value: string; detail: string; size?: 'large' }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card variant="surface">
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Icon className="size-4 text-primary" />
          </div>
          <p className={`font-mono font-semibold tabular-nums ${size ? 'text-2xl' : 'text-xl'}`}>{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function QueueLine({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2 hover:bg-muted">
      <CircleAlert className="size-4 text-warning" />
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2 font-mono text-sm tabular-nums">
        {value}
        <ArrowRight className="size-3 text-muted-foreground" />
      </span>
    </Link>
  );
}
