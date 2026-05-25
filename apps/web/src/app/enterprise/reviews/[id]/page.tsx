'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RouteGuard } from '../../../../components/route-guard';
import { EnterpriseLayout } from '../../../../components/enterprise-layout';
import { StatusBadge } from '../../../../components/status-badge';
import { claimReview, approveReview, rejectReview, getReviewDetail } from '../../../../lib/api/reviews';
import type { ReviewDetail } from '../../../../lib/api/reviews';
import { BalanceApiError } from '../../../../lib/api/client';
import { useAuth } from '../../../../context/auth-context';
import { canDecideReview } from '../../../../lib/role-permissions';
import { DocumentPreview } from '@/components/document/document-preview';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatMoney } from '@/lib/format';
import { PageTransition } from '@/components/workspace/page-transition';

export default function ReviewDetailPage() {
  return (
    <RouteGuard allowedRoles={['reviewer', 'admin', 'system_admin']}>
      <EnterpriseLayout>
        <ReviewDetailContent />
      </EnterpriseLayout>
    </RouteGuard>
  );
}

function ReviewDetailContent() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();
  const router = useRouter();

  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [claiming, setClaiming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);

  function loadReview() {
    setLoading(true);
    getReviewDetail(id)
      .then((res) => { setReview(res.review); setLoading(false); })
      .catch((err) => {
        if (err instanceof BalanceApiError && err.status === 404) setError('Review not found.');
        else if (err instanceof BalanceApiError && err.status === 403) setError('Access denied. Another reviewer may have claimed this item.');
        else setError('Failed to load review.');
        setLoading(false);
      });
  }

  useEffect(() => { loadReview(); }, [id]);

  async function handleClaim() {
    setActionError(null);
    setClaiming(true);
    try {
      await claimReview(id);
      loadReview();
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 409) setActionError('Review is no longer pending or has already been claimed.');
      else if (err instanceof BalanceApiError && err.status === 403) setActionError('Access denied.');
      else setActionError('Failed to claim review. Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  async function handleApprove() {
    setActionError(null);
    setApproving(true);
    try {
      await approveReview(id);
      router.push('/enterprise/reviews');
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 409) setActionError('Review cannot be approved at this stage.');
      else if (err instanceof BalanceApiError && err.status === 403) setActionError('You are not assigned to this review.');
      else setActionError('Failed to approve. Please try again.');
      setApproving(false);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    if (!rejectNote.trim()) { setActionError('Rejection reason is required.'); return; }

    setRejecting(true);
    try {
      await rejectReview(id, rejectNote.trim());
      router.push('/enterprise/reviews');
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 409) setActionError('Review cannot be rejected at this stage.');
      else if (err instanceof BalanceApiError && err.status === 403) setActionError('You are not assigned to this review.');
      else setActionError('Failed to reject. Please try again.');
      setRejecting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading review…</p>;
  if (error) return (
    <div className="flex flex-col gap-4">
      <Alert role="alert" variant="destructive">{error}</Alert>
      <Link href="/enterprise/reviews" className="text-sm text-muted-foreground hover:text-foreground">Back to queue</Link>
    </div>
  );
  if (!review) return null;

  const isAssignedToMe = review.reviewerId === user?.id;
  const canDecideRole = user?.role === 'admin' || user?.role === 'system_admin';
  const canClaim = review.status === 'pending';
  const canDecide = canDecideReview(user?.role, review.status);
  const isFinal = review.status === 'approved' || review.status === 'rejected';

  return (
    <PageTransition>
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/enterprise/reviews" className="mb-2 inline-block text-xs text-muted-foreground hover:text-foreground">Review Queue</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{review.document.originalFilename}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Claim: {review.claim.purpose}</p>
        </div>
        <StatusBadge status={review.status} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
        <DocumentPreview documentId={review.document.id} filename={review.document.originalFilename} />
        <div className="grid content-start gap-5">
      {/* Document info */}
      <Card>
        <CardHeader><CardTitle>Evidence Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Merchant</p><p>{review.document.merchantName ?? 'Not captured'}</p></div>
          <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-mono tabular-nums">{formatMoney(review.document.amountMinor, review.document.currency ?? 'MYR')}</p></div>
          <div><p className="text-xs text-muted-foreground">Date</p><p className="font-mono text-xs tabular-nums">{review.document.documentDate ?? 'Not captured'}</p></div>
          <div><p className="text-xs text-muted-foreground">Document Status</p><StatusBadge status={review.document.status} /></div>
          {review.reviewerId && review.status === 'in_review' && (
            <div className="col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Assigned to</p>
              <p className="text-sm">Reviewer</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert variant={review.document.fields.some((field) => field.confidence != null && field.confidence < 70) ? 'warning' : 'success'}>
        {review.document.fields.some((field) => field.confidence != null && field.confidence < 70)
          ? 'Low-confidence extracted fields require reviewer attention before a decision.'
          : 'Extraction confidence is acceptable for reviewer verification.'}
      </Alert>

      <Card>
      <CardHeader><CardTitle>Reviewer Checklist</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {['Merchant matches proof', 'Date is captured', 'Total reconciles', 'Payment proof visible', 'Claim purpose matches policy', 'Line items look plausible'].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm">
              <span className="size-2 rounded-full bg-primary" />
              {item}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Claim</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-sm font-medium">{review.claim.purpose}</p>
          {review.claim.note && <p className="text-sm text-muted-foreground">{review.claim.note}</p>}
          <p className="font-mono text-xs text-muted-foreground tabular-nums">Submitted {formatDateTime(review.claim.submittedAt)}</p>
          <StatusBadge status={review.claim.status} />
        </CardContent>
      </Card>

      {/* Decision controls */}
      {!isFinal && (
        <Card>
          <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {actionError && <Alert role="alert" variant="destructive">{actionError}</Alert>}

            {canClaim && (
              <Button onClick={handleClaim} disabled={claiming} className="w-fit">
                {claiming ? 'Claiming…' : 'Claim and start review'}
              </Button>
            )}

            {canDecide && !showRejectForm && (
              <div className="flex gap-3">
                <Button onClick={handleApprove} disabled={approving || rejecting}>
                  {approving ? 'Approving…' : 'Approve'}
                </Button>
                <Button variant="destructive" onClick={() => setShowRejectForm(true)} disabled={approving || rejecting}>
                  Reject
                </Button>
              </div>
            )}

            {canDecide && showRejectForm && (
              <form onSubmit={handleReject} className="grid max-w-lg gap-3">
                <Textarea
                  id="reject-note"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  disabled={rejecting}
                  rows={3}
                  placeholder="Rejection reason"
                />
                <div className="flex gap-3">
                  <Button type="submit" variant="destructive" disabled={rejecting}>
                    {rejecting ? 'Rejecting…' : 'Confirm rejection'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setShowRejectForm(false); setRejectNote(''); setActionError(null); }}
                    disabled={rejecting}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {review.status === 'in_review' && !isAssignedToMe && !canDecideRole && (
              <p className="text-sm text-muted-foreground">This review is assigned to another reviewer.</p>
            )}
          </CardContent>
        </Card>
      )}

      {isFinal && (
        <Alert variant={review.status === 'approved' ? 'success' : 'destructive'}>
          Review {review.status}. {review.decisionNote ?? ''}
        </Alert>
      )}

        </div>
      </div>

      {/* Extracted fields */}
      {review.document.fields.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Extracted Fields</CardTitle></CardHeader>
          <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {review.document.fields.map((field) => (
              <div key={field.id} className="grid gap-1 rounded-md border border-border bg-background/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{field.label}</span>
                  {field.confidence != null && <Badge variant={field.confidence >= 90 ? 'success' : field.confidence >= 70 ? 'warning' : 'danger'}>{field.confidence.toFixed(0)}%</Badge>}
                </div>
                <span className="font-medium">
                  {field.correctedValue ?? field.value}
                  {field.correctedValue && <span className="ml-2 text-xs text-muted-foreground line-through">{field.value}</span>}
                </span>
              </div>
            ))}
          </div>
          </CardContent>
        </Card>
      )}

      {/* Audit timeline */}
      {review.auditEvents.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Audit Timeline</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {review.auditEvents.map((event) => (
              <div key={event.id} className="grid gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs md:grid-cols-[10rem_1fr_auto]">
                <span className="font-mono text-muted-foreground tabular-nums">{formatDateTime(event.createdAt)}</span>
                <span>{event.message}</span>
                <span className="text-muted-foreground">{event.actorRole}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
    </PageTransition>
  );
}
