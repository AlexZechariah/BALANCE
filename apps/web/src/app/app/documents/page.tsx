'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DocumentStatus } from '@balance/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpDown, FileUp, LayoutList, MoreHorizontal, RefreshCcw, Search, Table2, Trash2,
  CheckCheck,
} from 'lucide-react';
import { RouteGuard } from '../../../components/route-guard';
import { ConsumerLayout } from '../../../components/consumer-layout';
import { StatusBadge } from '../../../components/status-badge';
import { deleteDocument, listDocuments, retryDocumentExtraction } from '../../../lib/api/documents';
import type { DocumentSummary } from '../../../lib/api/documents';
import { BalanceApiError } from '../../../lib/api/client';
import { formatDate, formatMoney, titleCase } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  alertDialogActionClassName, alertDialogCancelClassName,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageTransition } from '@/components/workspace/page-transition';

const STATUS_TABS: ReadonlyArray<{ value: DocumentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'correction_required', label: 'Needs review' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'submitted', label: 'Claimed' },
  { value: 'failed', label: 'Failed' }
];

export default function DocumentsPage() {
  return (
    <RouteGuard allowedRoles={['consumer', 'staff', 'admin']}>
      <ConsumerLayout>
        <DocumentsContent />
      </ConsumerLayout>
    </RouteGuard>
  );
}

function DocumentsContent() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DocumentStatus | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [view, setView] = useState<'table' | 'list'>('table');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const filters: Parameters<typeof listDocuments>[0] = {};
    if (search) filters.search = search;
    if (status !== 'all') filters.status = status;
    if (category !== 'all') filters.category = category;

    listDocuments(filters)
      .then((res) => { setDocuments(res.documents); setLoading(false); })
      .catch((err) => {
        setError(err instanceof BalanceApiError ? err.error.message : 'Failed to load documents.');
        setLoading(false);
      });
  }, [search, status, category]);

  const categories = Array.from(new Set(documents.map((doc) => doc.category).filter(Boolean))) as string[];

  async function retry(id: string) {
    await retryDocumentExtraction(id, 'paddleocr');
    const filters: Parameters<typeof listDocuments>[0] = {};
    if (search) filters.search = search;
    if (status !== 'all') filters.status = status;
    const res = await listDocuments(filters);
    setDocuments(res.documents);
  }

  async function remove(id: string) {
    await deleteDocument(id);
    setDocuments((items) => items.filter((doc) => doc.id !== id));
  }

  return (
    <PageTransition>
      <div className="grid gap-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Inbox</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Documents</h1>
          </div>
          <Button asChild>
            <Link href="/app/documents/upload">
              <FileUp className="size-4" />
              Upload document
            </Link>
          </Button>
        </div>

        <div className="sticky top-[61px] z-30 grid gap-3 rounded-md border border-border bg-background/60 p-3 backdrop-blur">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchant, filename, amount, date, notes, line item"
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="lg:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((value) => <SelectItem key={value} value={value}>{titleCase(value)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border border-border bg-muted p-1">
              <Button type="button" size="sm" variant={view === 'table' ? 'subtle' : 'ghost'} onClick={() => setView('table')} aria-label="Table view"><Table2 /></Button>
              <Button type="button" size="sm" variant={view === 'list' ? 'subtle' : 'ghost'} onClick={() => setView('list')} aria-label="List view"><LayoutList /></Button>
            </div>
            <Select value={density} onValueChange={(value) => setDensity(value as 'comfortable' | 'compact')}>
              <SelectTrigger className="lg:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
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

      {!loading && !error && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background/40 px-6 py-12 text-center">
          <div>
            <p className="font-medium text-foreground">No documents match this view</p>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters or upload a new document.</p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/documents/upload">Upload document</Link>
          </Button>
        </div>
      )}

      {!loading && documents.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{documents.length} visible documents</span>
            {Object.values(selected).some(Boolean) && <Badge variant="neutral">{Object.values(selected).filter(Boolean).length} selected</Badge>}
          </div>

          {/* Bulk actions toolbar */}
          {Object.values(selected).some(Boolean) && (
            <BulkActionsToolbar
              selectedCount={Object.values(selected).filter(Boolean).length}
              onRetry={async () => {
                const ids = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
                await Promise.allSettled(ids.map((id) => retryDocumentExtraction(id, 'paddleocr')));
                setSelected({});
                const filters: Parameters<typeof listDocuments>[0] = {};
                if (search) filters.search = search;
                if (status !== 'all') filters.status = status;
                const res = await listDocuments(filters);
                setDocuments(res.documents);
              }}
              onDelete={() => {
                const ids = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
                setBulkDeleteIds(ids);
                setShowBulkDelete(true);
              }}
              onClear={() => setSelected({})}
            />
          )}

          {view === 'table' ? (
            <div className="overflow-hidden rounded-md border border-border bg-background/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all documents"
                        checked={documents.length > 0 && documents.every((doc) => selected[doc.id])}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelected(Object.fromEntries(documents.map((doc) => [doc.id, true])));
                          } else {
                            setSelected({});
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>
                      <button className="inline-flex items-center gap-1 hover:text-foreground" type="button">
                        Document
                        <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button className="inline-flex items-center gap-1 hover:text-foreground" type="button">
                        Merchant
                        <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button className="inline-flex items-center gap-1 hover:text-foreground" type="button">
                        Amount
                        <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button className="inline-flex items-center gap-1 hover:text-foreground" type="button">
                        Date
                        <ArrowUpDown className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence initial={false}>
                    {documents.map((doc) => (
                      <motion.tr
                        key={doc.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="border-b border-border last:border-0 hover:bg-muted/45"
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${doc.originalFilename}`}
                            checked={Boolean(selected[doc.id])}
                            onCheckedChange={(checked) => setSelected((prev) => ({ ...prev, [doc.id]: checked === true }))}
                          />
                        </TableCell>
                        <TableCell className={density === 'compact' ? 'py-2' : undefined}>
                          <Link href={`/app/documents/${doc.id}`} className="font-medium hover:text-primary">{doc.originalFilename}</Link>
                          <p className="mt-1 text-xs text-muted-foreground">{doc.documentType ?? doc.contentType}</p>
                        </TableCell>
                        <TableCell>{doc.merchantName ?? 'Not captured'}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatMoney(doc.amountMinor, doc.currency ?? 'MYR')}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{formatDate(doc.transactionDate ?? doc.documentDate ?? doc.createdAt)}</TableCell>
                        <TableCell>
                          {doc.qualityScore != null ? (
                            <Badge variant={doc.qualityScore >= 80 ? 'success' : doc.qualityScore >= 55 ? 'warning' : 'danger'}>
                              {doc.qualityScore}%
                            </Badge>
                          ) : (
                            <Badge variant="neutral">No score</Badge>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge status={doc.status} /></TableCell>
                        <TableCell>
                          <RowActions doc={doc} onRetry={() => retry(doc.id)} onDelete={() => remove(doc.id)} />
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-3">
              {documents.map((doc) => (
                <Link key={doc.id} href={`/app/documents/${doc.id}`} className="grid gap-2 rounded-lg border border-border bg-card p-4 hover:bg-muted md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-medium">{doc.originalFilename}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{doc.merchantName ?? 'Not captured'} · {formatMoney(doc.amountMinor, doc.currency ?? 'MYR')}</p>
                  </div>
                  <StatusBadge status={doc.status} />
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkDeleteIds.length} document{bulkDeleteIds.length !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected documents{bulkDeleteIds.length === 1 ? '' : 's'}. Audit context is retained for system history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={alertDialogCancelClassName} disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={alertDialogActionClassName} disabled={bulkDeleting} onClick={async () => {
              setBulkDeleting(true);
              try {
                await Promise.allSettled(bulkDeleteIds.map((id) => deleteDocument(id)));
                setDocuments((items) => items.filter((doc) => !bulkDeleteIds.includes(doc.id)));
                setSelected({});
              } finally {
                setBulkDeleting(false);
                setShowBulkDelete(false);
                setBulkDeleteIds([]);
              }
            }}>
              {bulkDeleting ? 'Deleting…' : `Delete ${bulkDeleteIds.length} document${bulkDeleteIds.length !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PageTransition>
  );
}

function BulkActionsToolbar({ selectedCount, onRetry, onDelete, onClear }: {
  selectedCount: number;
  onRetry: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-accent/10 px-3 py-2.5 text-sm">
      <CheckCheck className="size-4 text-accent" />
      <span className="font-medium text-foreground">{selectedCount} selected</span>
      <Separator orientation="vertical" className="h-5" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCcw className="size-3.5" />
              Retry all
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-run open-source OCR extraction for all selected documents</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete all
            </Button>
          </TooltipTrigger>
          <TooltipContent>Permanently delete all selected documents</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClear}>Clear selection</Button>
    </div>
  );
}

function RowActions({ doc, onRetry, onDelete }: { doc: DocumentSummary; onRetry: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${doc.originalFilename}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!doc.claimIntent && <DropdownMenuItem asChild><Link href={`/app/documents/${doc.id}`}>Open detail</Link></DropdownMenuItem>}
        {!['queued', 'processing', 'submitted', 'reviewed'].includes(doc.status) && (
          <DropdownMenuItem onClick={onRetry}>
            <RefreshCcw className="size-4" />
            Retry OCR
          </DropdownMenuItem>
        )}
        {!['submitted', 'reviewed'].includes(doc.status) && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
