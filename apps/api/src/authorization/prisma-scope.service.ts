import { Injectable } from '@nestjs/common';
import type { Prisma } from '@balance/db';

import { type AppAbility, AbilityFactory } from './ability.factory';
import type { CurrentActor } from './current-actor';

const NO_VISIBLE_ID = '00000000-0000-0000-0000-000000000000';

function roleOf(actor: CurrentActor): string {
  return String(actor.role);
}

function organizationIdOrNone(actor: CurrentActor): string {
  return actor.organizationId ?? NO_VISIBLE_ID;
}

function isSystemAdmin(actor: CurrentActor): boolean {
  return roleOf(actor) === 'system_admin';
}

function visibleReviewWhere(actor: CurrentActor): Prisma.ReviewWhereInput {
  return {
    OR: [{ status: 'pending', reviewerId: null }, { reviewerId: actor.id }]
  };
}

function reviewerTenantWhere(actor: CurrentActor): Prisma.DocumentWhereInput {
  const reviewWhere = visibleReviewWhere(actor);
  if (!actor.organizationId) return { review: { is: reviewWhere } };
  return {
    AND: [
      { organizationId: actor.organizationId },
      { review: { is: reviewWhere } }
    ]
  };
}

@Injectable()
export class PrismaScopeService {
  constructor(private readonly abilityFactory: AbilityFactory = new AbilityFactory()) {}

  abilityFor(actor: CurrentActor): AppAbility {
    return this.abilityFactory.createForActor(actor);
  }

  documentWhere(actor: CurrentActor): Prisma.DocumentWhereInput {
    if (isSystemAdmin(actor)) return {};
    if (roleOf(actor) === 'admin') return { organizationId: organizationIdOrNone(actor) };
    if (roleOf(actor) === 'reviewer') return reviewerTenantWhere(actor);
    return { ownerId: actor.id };
  }

  storageObjectWhere(actor: CurrentActor): Prisma.DocumentWhereInput {
    return this.documentWhere(actor);
  }

  documentFieldWhere(actor: CurrentActor): Prisma.DocumentFieldWhereInput {
    return { document: this.documentWhere(actor) };
  }

  extractionJobWhere(actor: CurrentActor): Prisma.ExtractionJobWhereInput {
    return { document: this.documentWhere(actor) };
  }

  claimWhere(actor: CurrentActor): Prisma.ClaimWhereInput {
    if (isSystemAdmin(actor)) return {};
    if (roleOf(actor) === 'admin') {
      return { organizationId: organizationIdOrNone(actor) };
    }
    if (roleOf(actor) === 'reviewer') {
      const reviewWhere = visibleReviewWhere(actor);
      if (!actor.organizationId) return { review: { is: reviewWhere } };
      return {
        AND: [
          { organizationId: actor.organizationId },
          { review: { is: reviewWhere } }
        ]
      };
    }
    return { consumerId: actor.id };
  }

  reviewWhere(actor: CurrentActor): Prisma.ReviewWhereInput {
    if (isSystemAdmin(actor)) return {};
    if (roleOf(actor) === 'admin') return { document: { organizationId: organizationIdOrNone(actor) } };

    const tenantWhere: Prisma.ReviewWhereInput =
      roleOf(actor) === 'reviewer' && actor.organizationId
        ? { document: { organizationId: actor.organizationId } }
        : {};

    return {
      AND: [
        tenantWhere,
        { OR: [{ status: 'pending', reviewerId: null }, { reviewerId: actor.id }] }
      ]
    };
  }

  budgetWhere(actor: CurrentActor): Prisma.BudgetWhereInput {
    if (isSystemAdmin(actor)) return {};
    return { userId: actor.id };
  }

  auditEventWhere(actor: CurrentActor): Prisma.AuditEventWhereInput {
    if (isSystemAdmin(actor)) return {};
    if (roleOf(actor) === 'admin' || roleOf(actor) === 'reviewer') {
      return { organizationId: organizationIdOrNone(actor) };
    }
    return { actorId: actor.id };
  }

  organizationWhere(actor: CurrentActor): Prisma.OrganizationWhereInput {
    if (isSystemAdmin(actor)) return {};
    return { id: organizationIdOrNone(actor) };
  }

  membershipWhere(actor: CurrentActor): Prisma.UserWhereInput {
    if (isSystemAdmin(actor)) return {};
    return { organizationId: organizationIdOrNone(actor) };
  }
}
