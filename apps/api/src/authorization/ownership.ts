import type { ReviewStatus } from '@balance/db';
import { subject } from '@casl/ability';

import { throwContractHttpError } from '../common/contract-errors';
import { AbilityFactory } from './ability.factory';
import { Actions } from './actions';
import type { ActorContext } from './current-actor';

export type { ActorContext } from './current-actor';

export type ReviewVisibilityRecord = {
  status: ReviewStatus | string;
  reviewerId: string | null;
  document?: { organizationId: string | null } | null;
  organizationId?: string | null;
};

export type DocumentVisibilityRecord = {
  ownerId: string;
  organizationId: string | null;
  review?: ReviewVisibilityRecord | null;
};

export type ClaimVisibilityRecord = {
  consumerId: string;
  document: { organizationId?: string | null };
  review: ReviewVisibilityRecord | null;
};

const abilityFactory = new AbilityFactory();

export function isSystemAdminRole(role: string): boolean {
  return role === 'system_admin';
}

export function isOrgAdminRole(role: string): boolean {
  return role === 'admin';
}

export function isReviewWorkerRole(role: string): boolean {
  return role === 'reviewer';
}

export function isStaffRole(role: string): boolean {
  return role === 'staff';
}

export function isConsumerRole(role: string): boolean {
  return role === 'consumer';
}

export function isReviewAccessRole(role: string): boolean {
  return isReviewWorkerRole(role) || isOrgAdminRole(role) || isSystemAdminRole(role);
}

export function isReviewDecisionRole(role: string): boolean {
  return isOrgAdminRole(role) || isSystemAdminRole(role);
}

export function assertReviewAccessActor(actor: ActorContext) {
  if (!isReviewAccessRole(String(actor.actorRole))) {
    throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
  }
}

export function assertReviewDecisionActor(actor: ActorContext) {
  if (!isReviewDecisionRole(String(actor.actorRole))) {
    throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
  }
}

export function reviewOrganizationId(review: ReviewVisibilityRecord): string | null {
  return review.organizationId ?? review.document?.organizationId ?? null;
}

export function sameOrganization(actor: ActorContext, organizationId: string | null | undefined): boolean {
  return Boolean(actor.organizationId && organizationId && actor.organizationId === organizationId);
}

function assertTenantVisibleToActor(review: ReviewVisibilityRecord, actor: ActorContext) {
  const actorRole = String(actor.actorRole);
  if (isSystemAdminRole(actorRole)) return;

  const orgId = reviewOrganizationId(review);
  if (sameOrganization(actor, orgId)) return;

  if (actorRole === 'reviewer' && !actor.organizationId) return;

  throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
}

export function assertReviewVisibleToActor(review: ReviewVisibilityRecord, actor: ActorContext) {
  const actorRole = String(actor.actorRole);
  assertReviewAccessActor(actor);
  assertTenantVisibleToActor(review, actor);

  const ability = abilityFactory.createForActor({
    id: actor.actorId,
    email: '',
    role: actorRole,
    organizationId: actor.organizationId ?? null
  });

  if (
    ability.can(
      Actions.review,
      subject('Review', {
        status: review.status,
        reviewerId: review.reviewerId,
        organizationId: reviewOrganizationId(review)
      })
    )
  ) {
    return;
  }

  throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
}

export function reviewVisibleToActor(review: ReviewVisibilityRecord | null | undefined, actor: ActorContext): boolean {
  if (!review) return false;
  try {
    assertReviewVisibleToActor(review, actor);
    return true;
  } catch {
    return false;
  }
}

export function assertDocumentVisibleToActor(document: DocumentVisibilityRecord, actor: ActorContext) {
  const actorRole = String(actor.actorRole);
  const ability = abilityFactory.createForActor({
    id: actor.actorId,
    email: '',
    role: actorRole,
    organizationId: actor.organizationId ?? null
  });

  const reviewVisible = reviewVisibleToActor(
    document.review ? { ...document.review, document: { organizationId: document.organizationId } } : null,
    actor
  );

  if (
    ability.can(
      Actions.read,
      subject('Document', {
        ownerId: document.ownerId,
        organizationId: document.organizationId,
        reviewVisible
      })
    )
  ) {
    return;
  }

  if (actorRole === 'consumer') {
    throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
  }

  throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
}

export function assertClaimVisibleToActor(claim: ClaimVisibilityRecord, actor: ActorContext) {
  const actorRole = String(actor.actorRole);
  const organizationId = claim.document.organizationId ?? null;
  const ability = abilityFactory.createForActor({
    id: actor.actorId,
    email: '',
    role: actorRole,
    organizationId: actor.organizationId ?? null
  });
  const reviewVisible = reviewVisibleToActor(
    claim.review ? { ...claim.review, document: { organizationId } } : null,
    actor
  );

  if (
    ability.can(
      Actions.read,
      subject('Claim', {
        consumerId: claim.consumerId,
        organizationId,
        reviewVisible
      })
    )
  ) {
    return;
  }

  if (actorRole === 'consumer') {
    throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
  }

  throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
}
