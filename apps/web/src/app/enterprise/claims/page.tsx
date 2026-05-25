'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import type { ClaimStatus } from '@balance/types';

import { RouteGuard } from '../../../components/route-guard';
import { EnterpriseLayout } from '../../../components/enterprise-layout';
import { StatusBadge } from '../../../components/status-badge';
import { useAuth } from '../../../context/auth-context';
import { listClaims, type Claim } from '../../../lib/api/claims';
import { listEnterpriseClaims, type EnterpriseClaimListItem } from '../../../lib/api/enterprise';
import { BalanceApiError } from '../../../lib/api/client';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageTransition } from '@/components/workspace/page-transition';

type Row = Claim | EnterpriseClaimListItem;

const STATUS_TABS: Array<{ value: ClaimStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function EnterpriseClaimsPage() {
  return (
    <RouteGuard allowedRoles={['staff', 'admin', 'reviewer']}>
      <EnterpriseLayout>
        <EnterpriseClaimsContent />
      </EnterpriseLayout>
    </RouteGuard>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatNumber(value)}</p>
      </CardContent>
    </Card>
  );
}

function EnterpriseClaimsContent() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canBrowseAll = isAdmin || user?.role === 'reviewer';

  const [claims, setClaims] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);

    const filters: { status?: ClaimStatus } = {};
    if (status !== 'all') filters.status = status;

    if (canBrowseAll) {
      listEnterpriseClaims(filters)
        .then((res) => {
          setClaims(res.claims);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load claims.');
          setLoading(false);
        });
    } else {
      listClaims(filters)
        .then((res) => {
          setClaims(res.claims);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load claims.');
          setLoading(false);
        });
    }
  }, [status, isAdmin]);

  const metrics = useMemo(() => ({
    total: claims.length,
    underReview: claims.filter((c) => c.status === 'under_review').length,
    approved: claims.filter((c) => c.status === 'approved').length,
    rejected: claims.filter((c) => c.status === 'rejected').length,
  }), [claims]);

  const filtered = useMemo(() => {
    if (!search.trim()) return claims;
    const q = search.toLowerCase();
    return claims.filter((claim) => {
      const consumerText = 'consumer' in claim ? `${claim.consumer.displayName} ${claim.consumer.email}` : '';
      const documentText = `${claim.document?.originalFilename ?? ''} ${claim.document?.merchantName ?? ''}`;
      const haystack = `${claim.purpose} ${claim.note ?? ''} ${consumerText} ${documentText}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [claims, search]);

  return (
    <PageTransition>
      <div className="grid gap-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Enterprise claims</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Claims</h1>
          </div>
          {user?.role !== 'reviewer' && (
            <Button asChild variant="secondary">
              <Link href="/enterprise/documents">
                <FileText className="size-4" />
                Open documents
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Total" value={metrics.total} />
          <Metric label="Under review" value={metrics.underReview} />
          <Metric label="Approved" value={metrics.approved} />
          <Metric label="Rejected" value={metrics.rejected} />
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
               placeholder={canBrowseAll ? 'Search staff, document, purpose, notes' : 'Search document, purpose, notes'}
            />
          </div>
          <Tabs value={status} onValueChange={(value) => setStatus(value as ClaimStatus | 'all')}>
            <TabsList className="flex w-full flex-wrap justify-start">
              {STATUS_TABS.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading claims…</p>}
        {error && <Alert role="alert" variant="destructive">{error}</Alert>}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No claims match this view.</p>
            <Link href="/enterprise/documents" className="mt-4 inline-block text-sm text-primary hover:underline">
              Upload or open a document to submit a claim
            </Link>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Document</TableHead>
                  {isAdmin && <TableHead>Owner</TableHead>}
                  <TableHead>Amount</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <Link href={`/enterprise/claims/${claim.id}`} className="font-medium hover:text-primary">
                        {claim.purpose}
                      </Link>
                      {claim.note && <p className="mt-1 text-xs text-muted-foreground">{claim.note}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="truncate text-sm">{claim.document?.originalFilename ?? claim.documentId}</p>
                      <p className="text-xs text-muted-foreground">{claim.document?.merchantName ?? 'Merchant not captured'}</p>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {'consumer' in claim ? (
                          <div className="grid gap-0.5">
                            <span className="text-sm">{claim.consumer.displayName}</span>
                            <span className="text-xs text-muted-foreground">{claim.consumer.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-mono tabular-nums">{formatMoney(claim.document?.amountMinor, claim.document?.currency ?? 'MYR')}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{formatDate(claim.submittedAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={claim.status} />
                      {claim.review?.decisionNote && <Badge variant="neutral" className="ml-2">Note</Badge>}
                    </TableCell>
                    <TableCell>
                      {'review' in claim && claim.review ? (
                        <StatusBadge status={claim.review.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border px-3 py-2">
              <Badge variant="neutral">{filtered.length} claims</Badge>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
