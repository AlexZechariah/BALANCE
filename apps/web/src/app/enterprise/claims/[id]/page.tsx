'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Clock, FileWarning, UserCircle } from 'lucide-react';

import { RouteGuard } from '@/components/route-guard';
import { EnterpriseLayout } from '@/components/enterprise-layout';
import { StatusBadge } from '@/components/status-badge';
import { StepTimeline, type StepTimelineStep } from '@/components/step-timeline';
import { AuditTrail } from '@/components/enterprise/audit-trail';
import { ClaimReviewPanel, type FieldItem } from '@/components/enterprise/claim-review-panel';
import { ClaimDecisionControls } from '@/components/enterprise/claim-decision-controls';
import { DocumentPreview } from '@/components/document/document-preview';
import { useAuth } from '@/context/auth-context';
import { getClaim, type Claim } from '@/lib/api/claims';
import { BalanceApiError } from '@/lib/api/client';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatMoney } from '@/lib/format';
import { statusLabel } from '@/lib/display-labels';
import { PageTransition } from '@/components/workspace/page-transition';

// ── Helpers ────────────────────────────────────────────────────────

function getEnterpriseTimelineSteps(claim: Claim): StepTimelineStep[] {
  const steps: StepTimelineStep[] = [];
  steps.push({
    label: 'Claim submitted',
    timestamp: claim.submittedAt,
    description: null,
    status: claim.submittedAt ? 'completed' : 'pending',
  });
  steps.push({
    label: 'Under review',
    timestamp: null,
    description: null,
    status: claim.submittedAt && claim.status === 'submitted'
      ? 'pending'
      : claim.status === 'under_review'
        ? 'current'
        : 'completed',
  });
  steps.push({
    label: claim.status === 'rejected' ? 'Rejected' : 'Approved',
    timestamp: claim.decidedAt,
    description: null,
    status: claim.status === 'approved'
      ? 'completed'
      : claim.status === 'rejected'
        ? 'failed'
        : 'pending',
  });
  return steps;
}

function getClaimNumber(id: string): string {
  return `#${id.slice(0, 8)}`;
}

function getAgeLabel(claim: Claim): string {
  const anchor = claim.submittedAt ?? claim.createdAt;
  if (!anchor) return 'Not submitted';
  const hours = Math.max(0, Math.round((Date.now() - new Date(anchor).getTime()) / 36e5));
  if (hours < 1) return 'Less than 1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function CaseMetric({ icon, label, value, detail }: { icon?: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <Card variant="surface">
      <CardContent className="grid gap-2 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="min-h-6 truncate text-sm font-semibold">{value}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function EnterpriseClaimDetailPage() {
  return (
    <RouteGuard allowedRoles={['staff', 'admin', 'reviewer']}>
      <EnterpriseLayout>
        <EnterpriseClaimDetailContent />
      </EnterpriseLayout>
    </RouteGuard>
  );
}

function EnterpriseClaimDetailContent() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function loadClaim() {
    // Use skeleton only on first load; background refresh keeps current content visible
    if (!claim) {
      setLoading(true);
    }
    setError(null);
    getClaim(id)
      .then((res) => {
        setClaim(res.claim);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof BalanceApiError && err.status === 404) setError('Claim not found.');
        else if (err instanceof BalanceApiError && err.status === 403) setError('Access denied.');
        else setError('Failed to load claim.');
        setLoading(false);
      });
  }

  useEffect(() => {
    loadClaim();
  }, [id]);

  // ── Derived states ──────────────────────────────────────────────

  const isCurrentReviewer = claim?.review?.reviewerId != null && claim.review.reviewerId === user?.id;
  const fieldsEditable = isCurrentReviewer && claim?.review?.status === 'in_review';

  const hasLowConfidence =
    claim?.document?.fields?.some((f) => f.confidence != null && f.confidence < 70) ?? false;

  const hasFields = (claim?.document?.fields?.length ?? 0) > 0;

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageTransition>
        <div className="grid gap-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(400px,1.1fr)]">
            <Skeleton className="h-[400px] w-full" />
            <div className="space-y-5">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  // ── Error ────────────────────────────────────────────────────────

  if (error && !claim) {
    return (
      <PageTransition>
        <div className="grid gap-4">
          <Alert role="alert" variant="destructive">{error}</Alert>
          <Link href="/enterprise/claims" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to claims
          </Link>
        </div>
      </PageTransition>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────

  if (!claim) return null;

  // ── Render ───────────────────────────────────────────────────────

  const timelineSteps = getEnterpriseTimelineSteps(claim);
  const consumer = claim.consumer;
  const displayName = consumer?.displayName ?? 'Unknown';
  const email = consumer?.email ?? '';
  const ageLabel = getAgeLabel(claim);

  return (
    <PageTransition>
      {/* ── Action error banner ────────────────────────────────── */}
      {actionError && (
        <Alert role="alert" variant="destructive" className="mb-6">
          {actionError}
        </Alert>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm text-muted-foreground">Decision case file {getClaimNumber(claim.id)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Claim Review</h1>
          <p className="mt-1 text-sm text-muted-foreground">{claim.purpose}</p>
          <p className="mt-1 text-xs text-muted-foreground">{claim.document?.originalFilename ?? 'No source document attached'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={claim.status} />
          <div className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs text-muted-foreground">
            <Clock className="size-4" />
            Age {ageLabel}
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CaseMetric icon={<UserCircle className="size-4" />} label="Claimant" value={displayName} detail={email} />
        <CaseMetric label="Amount" value={formatMoney(claim.document?.amountMinor, claim.document?.currency ?? 'MYR')} detail={claim.document?.merchantName ?? 'Merchant not captured'} />
        <CaseMetric label="Decision State" value={statusLabel(claim.status)} detail={claim.decidedAt ? formatDateTime(claim.decidedAt) : 'Awaiting decision'} />
        <CaseMetric icon={<FileWarning className="size-4" />} label="Review Risk" value={hasLowConfidence ? 'Needs Attention' : 'Ready To Review'} detail={hasLowConfidence ? 'Low-confidence fields present' : 'Confidence acceptable'} />
      </div>

      {claim.note && (
        <Card variant="surface" className="mb-5">
          <CardContent className="p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Policy or context notes</p>
            <p className="mt-2">{claim.note}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Two-column layout ────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(400px,1.1fr)]">
        {/* Left: Document preview */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          {claim.document && (
            <DocumentPreview
              documentId={claim.document.id}
              contentType={claim.document.contentType ?? null}
              filename={claim.document.originalFilename}
            />
          )}
        </div>

        {/* Right: Summary + Actions */}
        <div className="flex flex-col gap-5">
          {/* Evidence Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Reviewer Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Merchant</p>
                <p>{claim.document?.merchantName ?? 'Not captured'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-mono tabular-nums">
                  {formatMoney(claim.document?.amountMinor, claim.document?.currency ?? 'MYR')}
                </p>
              </div>
              {claim.document?.documentDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-mono text-xs tabular-nums">{claim.document.documentDate}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Document Status</p>
                <StatusBadge status={claim.document?.status ?? 'uploaded'} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reviewer</p>
                <p>{isCurrentReviewer ? 'Assigned To You' : claim.review?.reviewerId ? 'Assigned' : 'Unassigned'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Confidence Alert */}
          {hasFields && (
            <Alert variant={hasLowConfidence ? 'warning' : 'success'}>
              {hasLowConfidence
                ? 'Low-confidence extracted fields require reviewer attention before a decision.'
                : 'Extraction confidence is acceptable for reviewer verification.'}
            </Alert>
          )}

          {/* Decision Controls */}
          <ClaimDecisionControls
            review={
              claim.review
                ? {
                    id: claim.review.id,
                    status: claim.review.status,
                    reviewerId: claim.review.reviewerId ?? null,
                    decisionNote: claim.review.decisionNote,
                    decidedAt: claim.review.decidedAt ?? null,
                  }
                : null
            }
            claimStatus={claim.status}
            onActionComplete={loadClaim}
            onError={setActionError}
          />
        </div>
      </div>

      {/* ── Full-width sections ──────────────────────────────────── */}

      {/* Document Information */}
      {hasFields && (
        <div className="mt-5">
          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Document Information</summary>
            <div className="border-t border-border p-5">
              <ClaimReviewPanel
                fields={claim.document!.fields as FieldItem[]}
                documentId={claim.document!.id}
                editable={fieldsEditable}
                onCorrectionsSaved={loadClaim}
              />
            </div>
          </details>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-5">
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <StepTimeline steps={timelineSteps} variant="compact" />
          </CardContent>
        </Card>
      </div>

      {/* Audit trail */}
      {claim.auditEvents && claim.auditEvents.length > 0 && (
        <div className="mt-5">
          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTrail events={claim.auditEvents} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link
          href="/enterprise/claims"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to claims
        </Link>
      </div>
    </PageTransition>
  );
}
