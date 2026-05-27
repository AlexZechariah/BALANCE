'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { RouteGuard } from '../../../components/route-guard';
import { EnterpriseLayout } from '../../../components/enterprise-layout';
import { getAuditSummary, listAuditEvents } from '../../../lib/api/audit';
import type { AuditEvent, AuditSummary } from '../../../lib/api/audit';
import { titleCase } from '@/lib/format';
import { BalanceApiError } from '../../../lib/api/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { PageTransition } from '@/components/workspace/page-transition';

export default function AdminAuditPage() {
  return (
    <RouteGuard allowedRoles={['admin', 'system_admin']}>
      <EnterpriseLayout>
        <AuditContent />
      </EnterpriseLayout>
    </RouteGuard>
  );
}

function AuditContent() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const LIMIT = 25;

  function load(off: number) {
    setLoading(true);
    const filters: Parameters<typeof listAuditEvents>[0] = { limit: LIMIT, offset: off };
    if (search) filters.search = search;
    if (action !== 'all') filters.action = action;
    if (entityType !== 'all') filters.entityType = entityType;

    Promise.all([
      listAuditEvents(filters),
      getAuditSummary()
    ])
      .then(([eventsResponse, summaryResponse]) => {
        setEvents(eventsResponse.auditEvents);
        setTotal(eventsResponse.page.total);
        setSummary(summaryResponse.summary);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load audit log.');
        setLoading(false);
      });
  }

  useEffect(() => { load(0); }, [search, action, entityType]);

  const actionColors: Record<string, string> = {
    'document.uploaded': 'text-emerald-700 dark:text-emerald-400',
    'document.deleted': 'text-red-700 dark:text-red-400',
    'documents.bulk_deleted': 'text-red-700 dark:text-red-400',
    'extraction.queued': 'text-amber-700 dark:text-yellow-400',
    'extraction.started': 'text-blue-700 dark:text-blue-400',
    'extraction.completed': 'text-emerald-700 dark:text-emerald-400',
    'extraction.failed': 'text-red-700 dark:text-red-400',
    'document.corrected': 'text-cyan-400',
    'claim.submitted': 'text-info',
    'review.started': 'text-blue-700 dark:text-blue-400',
    'review.approved': 'text-emerald-700 dark:text-emerald-400',
    'review.rejected': 'text-red-700 dark:text-red-400',
    'budget.created': 'text-emerald-700 dark:text-emerald-400',
    'budget.updated': 'text-blue-700 dark:text-blue-400',
    'budget.deleted': 'text-red-700 dark:text-red-400',
  };

  return (
    <PageTransition>
    <div className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Admin console</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organization-visible activity. {total > 0 && `${total} events in this filter.`}</p>
        </div>
        <Button
          onClick={() => { setOffset(0); load(0); }}
          disabled={loading}
          variant="secondary"
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Visible events" value={summary?.total ?? total} hint="Same access scope as the table" />
        <Metric label="Failed extractions" value={summary?.failedExtractions ?? 0} hint="OCR failures in visible audit history" />
        <Metric label="Destructive changes" value={summary?.destructiveChanges ?? 0} hint="Deletes and irreversible admin actions" />
        <Metric label="Active actor roles" value={summary?.activeActorRoles ?? 0} hint="Distinct roles represented in events" />
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search action, message, actor, entity ID" />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(summary?.byAction ?? []).map((item) => <SelectItem key={item.action} value={item.action}>{item.action}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="extraction_job">Extraction job</SelectItem>
            <SelectItem value="claim">Claim</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="budget">Budget</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <Alert role="alert" variant="destructive">{error}</Alert>}

      {loading && <p className="text-sm text-muted-foreground">Loading audit log...</p>}

      {!loading && events.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No audit events match this filter.</p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event, i) => (
                <TableRow key={event.id} className={i % 2 === 0 ? '' : 'bg-muted/35'}>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className={`font-mono text-xs font-medium ${actionColors[event.action] ?? 'text-muted-foreground'}`}>{titleCase(event.action)}</span>
                  </TableCell>
                  <TableCell className="text-xs">{event.message}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {titleCase(event.actorRole)}
                    {event.actorId && <span className="ml-1 font-mono">{event.actorId.slice(0, 8)}</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {titleCase(event.entityType)} · {event.entityId.slice(0, 8)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {offset + 1}-{Math.min(offset + LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); load(o); }}
                  disabled={offset === 0 || loading}
                  variant="secondary"
                  size="sm"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => { const o = offset + LIMIT; setOffset(o); load(o); }}
                  disabled={offset + LIMIT >= total || loading}
                  variant="secondary"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </PageTransition>
  );
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
