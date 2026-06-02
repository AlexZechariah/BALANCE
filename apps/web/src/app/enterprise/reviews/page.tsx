'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { RouteGuard } from '../../../components/route-guard';
import { EnterpriseLayout } from '../../../components/enterprise-layout';
import { StatusBadge } from '../../../components/status-badge';
import { assignReview, getReviewMetrics, listReviewQueue } from '../../../lib/api/reviews';
import type { ReviewMetrics, ReviewQueueItem } from '../../../lib/api/reviews';
import { listMembers } from '../../../lib/api/enterprise';
import { BalanceApiError } from '../../../lib/api/client';
import { useAuth } from '../../../context/auth-context';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageTransition } from '@/components/workspace/page-transition';

export default function ReviewQueuePage() {
  return (
    <RouteGuard allowedRoles={['reviewer', 'admin', 'system_admin']}>
      <EnterpriseLayout>
        <ReviewQueueContent />
      </EnterpriseLayout>
    </RouteGuard>
  );
}

function ReviewQueueContent() {
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([]);
  const [metrics, setMetrics] = useState<ReviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [reviewers, setReviewers] = useState<Array<{ id: string; displayName: string }>>([]);


  function load() {
    setLoading(true);
    const filters: Parameters<typeof listReviewQueue>[0] = {};
    if (status !== 'all') filters.status = status as ReviewQueueItem['status'];

    Promise.all([
      listReviewQueue(filters),
      getReviewMetrics()
    ])
      .then(([queue, metricResponse]) => {
        setReviews(queue.reviews);
        setMetrics(metricResponse.metrics);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load review queue.');
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, [status]);

  useEffect(() => {
    if (user?.role === 'admin') {
      listMembers().then(res => {
        setReviewers(res.members.filter(m => m.role === 'reviewer'));
      }).catch(() => {});
    }
  }, [user]);

  const filtered = reviews.filter((review) => `${review.originalFilename} ${review.claimPurpose} ${review.consumerName} ${review.merchantName ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageTransition>
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Enterprise review</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Review Queue</h1>
        </div>
        <Button
          onClick={load}
          disabled={loading}
          variant="secondary"
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Pending" value={metrics?.pendingQueueSize ?? 0} />
        <Metric label="In review" value={metrics?.inReviewCount ?? 0} />
        <Metric label="High risk" value={metrics?.highRiskCount ?? 0} />
        <Metric label="Approval rate" value={metrics?.approvalRate == null ? 'No baseline' : formatPercent(metrics.approvalRate * 100)} />
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search consumer, merchant, file" />
        </div>
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="all">Open</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="in_review">My reviews</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading queue…</p>}

      {error && <Alert role="alert" variant="destructive">{error}</Alert>}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No items in this review view.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Consumer</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>SLA age</TableHead>
                <TableHead>Status</TableHead>
                {user?.role === 'admin' && <TableHead className="w-40">Assign</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <Link href={`/enterprise/reviews/${review.id}`} className="font-medium hover:text-primary">{review.originalFilename}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(review.submittedAt)}</p>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm text-muted-foreground" title={review.claimPurpose}>{review.claimPurpose}</TableCell>
                  <TableCell>{review.consumerName}</TableCell>
                  <TableCell>{review.merchantName ?? 'Not captured'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatMoney(review.amountMinor, review.currency ?? 'MYR')}</TableCell>
                  <TableCell><Badge variant="neutral">{slaAge(review.submittedAt)}</Badge></TableCell>
                  <TableCell><StatusBadge status={review.status} /></TableCell>
                  {user?.role === 'admin' && (
                    <TableCell>
                      {review.status === 'pending' ? (
                        <Select
                          value=""
                          onValueChange={(reviewerId) => {
                            assignReview(review.id, reviewerId).then(() => load());
                          }}
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue placeholder="Assign to…" />
                          </SelectTrigger>
                          <SelectContent>
                            {reviewers.length === 0 && (
                              <SelectItem value="__none__" disabled>No reviewers</SelectItem>
                            )}
                            {reviewers.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.displayName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
    </PageTransition>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function slaAge(value: string) {
  const ageMs = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(ageMs / 3_600_000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
