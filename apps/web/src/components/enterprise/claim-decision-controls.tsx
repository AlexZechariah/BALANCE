'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, XCircle, Play, UserPlus } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import {
  claimReview,
  assignReview,
  unassignReview,
  approveReview,
  rejectReview,
} from '@/lib/api/reviews';
import { listMembers } from '@/lib/api/enterprise';
import type { AuthUser } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ClaimDecisionControlsProps {
  /** The review object from the claim (can be null if claim is draft) */
  review: {
    id: string;
    status: string;
    reviewerId: string | null;
    decisionNote: string | null;
    decidedAt?: string | null;
  } | null;
  /** Claim status (for draft detection) */
  claimStatus: string;
  /** Called after any action completes; the parent refreshes data. */
  onActionComplete: () => void;
  /** Called with a new error message to show upstream */
  onError: (message: string | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const isAdminRole = (role: string | undefined): boolean =>
  role === 'admin' || role === 'system_admin';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ClaimDecisionControls({
  review,
  claimStatus,
  onActionComplete,
  onError,
}: ClaimDecisionControlsProps) {
  const { user } = useAuth();

  /* ---------- members list (for assign / reassign) ---------- */

  const [availableReviewers, setAvailableReviewers] = useState<AuthUser[]>([]);

  useEffect(() => {
    if (!user) return;
    // Only admin/system_admin needs the member list
    if (!isAdminRole(user.role)) return;

    let cancelled = false;

    listMembers()
      .then((res) => {
        if (cancelled) return;
        setAvailableReviewers(
          res.members.filter(
            (m) => m.role === 'reviewer' || m.role === 'admin',
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setAvailableReviewers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  /* ---------- individual loading states ---------- */

  const [assignLoading, setAssignLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [unassignLoading, setUnassignLoading] = useState(false);

  /* ---------- assign dropdown ---------- */

  const [selectedReviewerId, setSelectedReviewerId] = useState('');

  /* ---------- reassign flow ---------- */

  const [showReassign, setShowReassign] = useState(false);
  const [reassignReviewerId, setReassignReviewerId] = useState('');

  /* ---------- reject flow ---------- */

  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  /* ---------- computed ---------- */

  const userRole = user?.role;
  const isAdmin = isAdminRole(userRole);

  const reviewerName = useMemo(() => {
    if (!review?.reviewerId || availableReviewers.length === 0) return null;
    return (
      availableReviewers.find((m) => m.id === review.reviewerId)
        ?.displayName ?? null
    );
  }, [review?.reviewerId, availableReviewers]);

  /* ---------- action handlers ---------- */

  const handleAssign = useCallback(async () => {
    if (!review || !selectedReviewerId) return;
    onError(null);
    setAssignLoading(true);
    try {
      await assignReview(review.id, selectedReviewerId);
      setSelectedReviewerId('');
      onActionComplete();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to assign review');
    } finally {
      setAssignLoading(false);
    }
  }, [review, selectedReviewerId, onError, onActionComplete]);

  const handleClaim = useCallback(async () => {
    if (!review) return;
    onError(null);
    setClaimLoading(true);
    try {
      await claimReview(review.id);
      onActionComplete();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to claim review');
    } finally {
      setClaimLoading(false);
    }
  }, [review, onError, onActionComplete]);

  const handleApprove = useCallback(async () => {
    if (!review) return;
    onError(null);
    setApproveLoading(true);
    try {
      await approveReview(review.id);
      onActionComplete();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to approve review');
    } finally {
      setApproveLoading(false);
    }
  }, [review, onError, onActionComplete]);

  const handleReject = useCallback(async () => {
    if (!review || !rejectNote.trim()) return;
    onError(null);
    setRejectLoading(true);
    try {
      await rejectReview(review.id, rejectNote.trim());
      setShowRejectInput(false);
      setRejectNote('');
      onActionComplete();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to reject review');
    } finally {
      setRejectLoading(false);
    }
  }, [review, rejectNote, onError, onActionComplete]);

  const handleUnassign = useCallback(async () => {
    if (!review) return;
    onError(null);
    setUnassignLoading(true);
    try {
      await unassignReview(review.id);
      setShowReassign(false);
      setReassignReviewerId('');
      onActionComplete();
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Failed to unassign review',
      );
    } finally {
      setUnassignLoading(false);
    }
  }, [review, onError, onActionComplete]);

  const handleReassign = useCallback(async () => {
    if (!review || !reassignReviewerId) return;
    onError(null);
    setReassignLoading(true);
    try {
      await assignReview(review.id, reassignReviewerId);
      setShowReassign(false);
      setReassignReviewerId('');
      onActionComplete();
    } catch (err) {
      onError(
        err instanceof Error ? err.message : 'Failed to reassign review',
      );
    } finally {
      setReassignLoading(false);
    }
  }, [review, reassignReviewerId, onError, onActionComplete]);

  /* ---------------------------------------------------------------- */
  /*  Render: State 1  – Draft / no review                            */
  /* ---------------------------------------------------------------- */

  if (!review || claimStatus === 'draft') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Claim is in draft
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Submit the claim from the document record
          </p>
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: State 4  – Approved                                     */
  /* ---------------------------------------------------------------- */

  if (review.status === 'approved') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="size-5 text-success" />
            Approved
          </CardTitle>
        </CardHeader>
        <CardContent>
          {review.decisionNote ? (
            <p className="text-sm text-muted-foreground">
              Decision note: {review.decisionNote}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No decision note provided.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: State 5  – Rejected                                     */
  /* ---------------------------------------------------------------- */

  if (review.status === 'rejected') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-destructive" />
            Rejected
          </CardTitle>
        </CardHeader>
        <CardContent>
          {review.decisionNote ? (
            <p className="text-sm text-muted-foreground">
              Reason: {review.decisionNote}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No rejection reason provided.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: State 2 & 2b  – Pending                                 */
  /* ---------------------------------------------------------------- */

  if (review.status === 'pending') {
    if (isAdmin) {
      // State 2 – Admin sees assign dropdown + start review
      return (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Pending review assignment
            </p>

            <div className="space-y-3">
              {/* Assign dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Assign to
                </label>
                <Select
                  value={selectedReviewerId}
                  onValueChange={setSelectedReviewerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReviewers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!selectedReviewerId || assignLoading || claimLoading}
                  onClick={handleAssign}
                  className="w-full"
                >
                  <UserPlus className="size-4" />
                  {assignLoading ? 'Assigning…' : 'Assign'}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              {/* Self-start */}
              <Button
                size="sm"
                variant="default"
                disabled={claimLoading || assignLoading}
                onClick={handleClaim}
                className="w-full"
              >
                <Play className="size-4" />
                {claimLoading ? 'Starting…' : 'Start Review'}
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (userRole === 'reviewer') {
      // State 2b – reviewer sees start review button
      return (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Pending review
            </p>
            <Button
              size="sm"
              variant="default"
              disabled={claimLoading}
              onClick={handleClaim}
              className="w-full"
            >
              <Play className="size-4" />
              {claimLoading ? 'Starting…' : 'Start Review'}
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Fallback for other roles on pending
    return (
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Pending review</p>
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: State 3  – In review, assigned to current user          */
  /* ---------------------------------------------------------------- */

  if (review.status === 'in_review' && review.reviewerId === user?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Review in progress
          </p>

          {showRejectInput ? (
            <div className="space-y-3">
              <Textarea
                placeholder="Reason for rejection…"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!rejectNote.trim() || rejectLoading}
                  onClick={handleReject}
                >
                  {rejectLoading ? 'Rejecting…' : 'Confirm rejection'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={rejectLoading}
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectNote('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={approveLoading || rejectLoading}
                  onClick={handleApprove}
                >
                  <CheckCircle className="size-4" />
                  {approveLoading ? 'Approving…' : 'Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={approveLoading || rejectLoading}
                  onClick={() => setShowRejectInput(true)}
                >
                  <XCircle className="size-4" />
                  Reject
                </Button>
              </div>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: State 3b & 3c  – In review, assigned to other           */
  /* ---------------------------------------------------------------- */

  if (review.status === 'in_review' && review.reviewerId !== user?.id) {
    if (isAdmin) {
      // State 3b – admin sees reassign / unassign
      return (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Assigned to {reviewerName ?? 'another reviewer'}
            </p>

            {showReassign ? (
              <div className="space-y-3">
                <Select
                  value={reassignReviewerId}
                  onValueChange={setReassignReviewerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableReviewers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!reassignReviewerId || reassignLoading}
                    onClick={handleReassign}
                  >
                    {reassignLoading ? 'Reassigning…' : 'Reassign'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={reassignLoading}
                    onClick={() => {
                      setShowReassign(false);
                      setReassignReviewerId('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowReassign(true)}
                >
                  <UserPlus className="size-4" />
                  Reassign
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={unassignLoading}
                  onClick={handleUnassign}
                >
                  {unassignLoading ? 'Unassigning…' : 'Unassign'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    // State 3c – reviewer sees read-only message
    return (
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This review is assigned to another reviewer
          </p>
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Fallback (unexpected status)                                    */
  /* ---------------------------------------------------------------- */

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Review status: {review.status}
        </p>
      </CardContent>
    </Card>
  );
}
