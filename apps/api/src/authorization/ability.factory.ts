import { AbilityBuilder, type Ability, type ForcedSubject } from '@casl/ability';
import { createPrismaAbility, type PrismaQuery } from '@casl/prisma';
import { Injectable } from '@nestjs/common';

import { Actions, type AppAction } from './actions';
import type { CurrentActor } from './current-actor';
import { Subjects, type AppSubject } from './subjects';

type SubjectShape<T extends AppSubject, TFields extends Record<string, unknown> = Record<string, unknown>> =
  TFields & ForcedSubject<T>;

type DocumentSubject = SubjectShape<'Document', { ownerId?: string; organizationId?: string | null; reviewVisible?: boolean }>;
type DocumentFieldSubject = SubjectShape<'DocumentField', { ownerId?: string; organizationId?: string | null; reviewVisible?: boolean }>;
type ExtractionJobSubject = SubjectShape<'ExtractionJob', { ownerId?: string; organizationId?: string | null; reviewVisible?: boolean }>;
type ExtractionArtifactSubject = SubjectShape<'ExtractionArtifact', { ownerId?: string; organizationId?: string | null; reviewVisible?: boolean }>;
type ClaimSubject = SubjectShape<'Claim', { consumerId?: string; organizationId?: string | null; reviewVisible?: boolean }>;
type ReviewSubject = SubjectShape<'Review', { status?: string; reviewerId?: string | null; organizationId?: string | null }>;
type BudgetSubject = SubjectShape<'Budget', { userId?: string }>;
type AuditEventSubject = SubjectShape<'AuditEvent', { actorId?: string | null; organizationId?: string | null; reviewVisible?: boolean }>;
type OrganizationSubject = SubjectShape<'Organization', { id?: string }>;
type MembershipSubject = SubjectShape<'Membership', { id?: string; organizationId?: string | null }>;
type StorageObjectSubject = SubjectShape<'StorageObject', { ownerId?: string; organizationId?: string | null; reviewVisible?: boolean }>;
type UserSubject = SubjectShape<'User', { id?: string; organizationId?: string | null }>;
type SessionSubject = SubjectShape<'Session', { userId?: string }>;

export type AppSubjects =
  | AppSubject
  | DocumentSubject
  | DocumentFieldSubject
  | ExtractionJobSubject
  | ExtractionArtifactSubject
  | ClaimSubject
  | ReviewSubject
  | BudgetSubject
  | AuditEventSubject
  | OrganizationSubject
  | MembershipSubject
  | StorageObjectSubject
  | UserSubject
  | SessionSubject
  | 'all';

export type AppAbility = Ability<[AppAction, AppSubjects], PrismaQuery>;

function roleOf(actor: CurrentActor): string {
  return String(actor.role);
}

function actorOrg(actor: CurrentActor): string | null {
  return actor.organizationId ?? null;
}

function ownableSubjects(): AppSubject[] {
  return [
    Subjects.Document,
    Subjects.DocumentField,
    Subjects.ExtractionJob,
    Subjects.ExtractionArtifact,
    Subjects.StorageObject
  ];
}

@Injectable()
export class AbilityFactory {
  createForActor(actor: CurrentActor): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);
    const role = roleOf(actor);
    const organizationId = actorOrg(actor);

    if (role === 'system_admin') {
      can(Actions.manage, 'all');
      return build();
    }

    can(Actions.read, Subjects.User, { id: actor.id });
    can(Actions.update, Subjects.User, { id: actor.id });
    can(Actions.read, Subjects.Session, { userId: actor.id });
    can(Actions.delete, Subjects.Session, { userId: actor.id });

    if (role === 'consumer' || role === 'staff') {
      can(Actions.create, Subjects.Document);
      can([Actions.read, Actions.update, Actions.delete, Actions.preview, Actions.download, Actions.retryExtraction], ownableSubjects(), {
        ownerId: actor.id
      });
      can([Actions.create, Actions.submit, Actions.read, Actions.update], Subjects.Claim, { consumerId: actor.id });
      can([Actions.create, Actions.read, Actions.update, Actions.delete], Subjects.Budget, { userId: actor.id });
      can(Actions.read, Subjects.AuditEvent, { actorId: actor.id });
    }

    if (role === 'admin' && organizationId) {
      can(Actions.create, Subjects.Document);
      can([Actions.read, Actions.update, Actions.delete, Actions.preview, Actions.download, Actions.retryExtraction], ownableSubjects(), {
        ownerId: actor.id
      });
      can([Actions.read, Actions.preview, Actions.download], ownableSubjects(), { organizationId });
      can([Actions.create, Actions.submit], Subjects.Claim, { consumerId: actor.id });
      can([Actions.read, Actions.review, Actions.approve, Actions.reject, Actions.assign], Subjects.Review, { organizationId });
      can([Actions.read, Actions.review], Subjects.Claim, { organizationId });
      can([Actions.read, Actions.create, Actions.update, Actions.delete], Subjects.Membership, { organizationId });
      can([Actions.read, Actions.update], Subjects.Organization, { id: organizationId });
      can(Actions.read, Subjects.AuditEvent, { organizationId });
    }

    if (role === 'reviewer') {
      const tenant = organizationId ? { organizationId } : {};
      can(Actions.review, Subjects.Review, { ...tenant, status: 'pending', reviewerId: null });
      can(Actions.review, Subjects.Review, { ...tenant, reviewerId: actor.id });
      can(Actions.read, Subjects.Review, { ...tenant, status: 'pending', reviewerId: null });
      can(Actions.read, Subjects.Review, { ...tenant, reviewerId: actor.id });
      can(Actions.read, [Subjects.Document, Subjects.DocumentField, Subjects.ExtractionJob, Subjects.ExtractionArtifact, Subjects.Claim, Subjects.AuditEvent], {
        ...tenant,
        reviewVisible: true
      });
      can([Actions.preview, Actions.download], Subjects.StorageObject, { ...tenant, reviewVisible: true });
    }

    return build();
  }
}
