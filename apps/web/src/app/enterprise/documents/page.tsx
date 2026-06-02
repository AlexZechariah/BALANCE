'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentStatus } from '@balance/types';
import { FileUp, Search } from 'lucide-react';

import { RouteGuard } from '../../../components/route-guard';
import { EnterpriseLayout } from '../../../components/enterprise-layout';
import { StatusBadge } from '../../../components/status-badge';
import { useAuth } from '../../../context/auth-context';
import { listDocuments, type DocumentSummary } from '../../../lib/api/documents';
import { listEnterpriseDocuments, type EnterpriseDocumentListItem } from '../../../lib/api/enterprise';
import { BalanceApiError } from '../../../lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMoney } from '@/lib/format';
import { PageTransition } from '@/components/workspace/page-transition';

type Row = (DocumentSummary & { owner?: undefined }) | EnterpriseDocumentListItem;

const STATUS_TABS: Array<{ value: DocumentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'correction_required', label: 'Needs review' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'submitted', label: 'Claimed' },
  { value: 'failed', label: 'Failed' },
];

export default function EnterpriseDocumentsPage() {
  return (
    <RouteGuard allowedRoles={['staff', 'admin']}>
      <EnterpriseLayout>
        <EnterpriseDocumentsContent />
      </EnterpriseLayout>
    </RouteGuard>
  );
}

function EnterpriseDocumentsContent() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DocumentStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params: Parameters<typeof listDocuments>[0] = {};
    if (status !== 'all') params.status = status;
    if (search.trim()) params.search = search.trim();

    if (isAdmin) {
      listEnterpriseDocuments(params)
        .then((res) => {
          setDocuments(res.documents);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load documents.');
          setLoading(false);
        });
    } else {
      listDocuments(params)
        .then((res) => {
          setDocuments(res.documents);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load documents.');
          setLoading(false);
        });
    }
  }, [status, search, isAdmin]);

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter((doc) => {
      const ownerText = 'owner' in doc && doc.owner ? `${doc.owner.displayName} ${doc.owner.email}` : '';
      const haystack = `${doc.originalFilename} ${doc.merchantName ?? ''} ${ownerText}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [documents, search]);

  return (
    <PageTransition>
      <div className="grid gap-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Enterprise records</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Documents</h1>
          </div>
          <Button asChild>
            <Link href="/enterprise/documents/upload">
              <FileUp className="size-4" />
              Upload document
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAdmin ? 'Search staff, merchant, filename' : 'Search merchant, filename'}
            />
          </div>
          <Tabs value={status} onValueChange={(value) => setStatus(value as DocumentStatus | 'all')}>
            <TabsList className="flex w-full flex-wrap justify-start">
              {STATUS_TABS.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
        {error && <Alert variant="destructive">{error}</Alert>}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No documents match this view.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  {isAdmin && <TableHead>Owner</TableHead>}
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Link href={`/enterprise/documents/${doc.id}`} className="font-medium hover:text-primary">
                        {doc.originalFilename}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{doc.merchantName ?? 'Merchant not captured'}</p>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {'owner' in doc && doc.owner ? (
                          <div className="grid gap-0.5">
                            <span className="text-sm">{doc.owner.displayName}</span>
                            <span className="text-xs text-muted-foreground">{doc.owner.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatMoney(doc.amountMinor, doc.currency ?? 'MYR')}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {formatDate((('transactionDate' in doc ? doc.transactionDate : null) ?? doc.documentDate ?? doc.createdAt) as string)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                      {'claim' in doc && doc.claim && <Badge variant="neutral" className="ml-2">Claim</Badge>}
                    </TableCell>
                    <TableCell>
                      {'review' in doc && doc.review ? (
                        <StatusBadge status={doc.review.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
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
