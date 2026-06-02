import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import { Actions } from '../src/authorization/actions';
import { AbilityFactory } from '../src/authorization/ability.factory';
import { PrismaScopeService } from '../src/authorization/prisma-scope.service';

const abilityFactory = new AbilityFactory();
const scopes = new PrismaScopeService(abilityFactory);

const consumer = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'consumer@balance.local',
  role: 'consumer',
  organizationId: null
};

const otherConsumer = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'other@balance.local',
  role: 'consumer',
  organizationId: null
};

const orgAdmin = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'admin@balance.local',
  role: 'admin',
  organizationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
};

const reviewer = {
  id: '44444444-4444-4444-4444-444444444444',
  email: 'reviewer@balance.local',
  role: 'reviewer',
  organizationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
};

const systemAdmin = {
  id: '55555555-5555-5555-5555-555555555555',
  email: 'system@balance.local',
  role: 'system_admin',
  organizationId: null
};

describe('Balance authorization policy', () => {
  it('allows consumers to manage only their own document, fields, storage object, extraction jobs, claims, and budgets', () => {
    const ability = abilityFactory.createForActor(consumer);

    expect(ability.can(Actions.read, subject('Document', { ownerId: consumer.id, organizationId: null }))).toBe(true);
    expect(ability.can(Actions.preview, subject('StorageObject', { ownerId: consumer.id, organizationId: null }))).toBe(true);
    expect(ability.can(Actions.update, subject('DocumentField', { ownerId: consumer.id, organizationId: null }))).toBe(true);
    expect(ability.can(Actions.retryExtraction, subject('ExtractionJob', { ownerId: consumer.id, organizationId: null }))).toBe(true);
    expect(ability.can(Actions.read, subject('Claim', { consumerId: consumer.id, organizationId: null }))).toBe(true);
    expect(ability.can(Actions.update, subject('Budget', { userId: consumer.id }))).toBe(true);

    expect(ability.can(Actions.read, subject('Document', { ownerId: otherConsumer.id, organizationId: null }))).toBe(false);
    expect(ability.can(Actions.preview, subject('StorageObject', { ownerId: otherConsumer.id, organizationId: null }))).toBe(false);
    expect(ability.can(Actions.update, subject('Budget', { userId: otherConsumer.id }))).toBe(false);

    expect(scopes.documentWhere(consumer)).toEqual({ ownerId: consumer.id });
    expect(scopes.claimWhere(consumer)).toEqual({ consumerId: consumer.id });
    expect(scopes.budgetWhere(consumer)).toEqual({ userId: consumer.id });
  });

  it('allows organization admins to access only their organization and system admins to access all tenants', () => {
    const adminAbility = abilityFactory.createForActor(orgAdmin);
    const systemAbility = abilityFactory.createForActor(systemAdmin);

    expect(adminAbility.can(Actions.read, subject('Document', { ownerId: consumer.id, organizationId: orgAdmin.organizationId }))).toBe(true);
    expect(adminAbility.can(Actions.read, subject('Document', { ownerId: consumer.id, organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }))).toBe(false);
    expect(adminAbility.can(Actions.read, subject('Membership', { organizationId: orgAdmin.organizationId }))).toBe(true);
    expect(adminAbility.can(Actions.update, subject('Membership', { organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }))).toBe(false);

    expect(systemAbility.can(Actions.manage, 'all')).toBe(true);
    expect(scopes.documentWhere(orgAdmin)).toEqual({ organizationId: orgAdmin.organizationId });
    expect(scopes.documentWhere(systemAdmin)).toEqual({});
    expect(scopes.membershipWhere(orgAdmin)).toEqual({ organizationId: orgAdmin.organizationId });
  });

  it('allows reviewers to see only visible review work and related document, claim, audit, storage, and extraction records', () => {
    const ability = abilityFactory.createForActor(reviewer);

    expect(
      ability.can(
        Actions.review,
        subject('Review', { status: 'pending', reviewerId: null, organizationId: reviewer.organizationId })
      )
    ).toBe(true);
    expect(
      ability.can(
        Actions.review,
        subject('Review', { status: 'in_review', reviewerId: reviewer.id, organizationId: reviewer.organizationId })
      )
    ).toBe(true);
    expect(
      ability.can(
        Actions.review,
        subject('Review', { status: 'in_review', reviewerId: otherConsumer.id, organizationId: reviewer.organizationId })
      )
    ).toBe(false);
    expect(
      ability.can(
        Actions.review,
        subject('Review', { status: 'pending', reviewerId: null, organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' })
      )
    ).toBe(false);

    expect(ability.can(Actions.preview, subject('StorageObject', { ownerId: consumer.id, organizationId: reviewer.organizationId, reviewVisible: true }))).toBe(true);
    expect(ability.can(Actions.read, subject('AuditEvent', { organizationId: reviewer.organizationId, reviewVisible: true }))).toBe(true);
    expect(scopes.reviewWhere(reviewer)).toEqual({
      AND: [
        { document: { organizationId: reviewer.organizationId } },
        { OR: [{ status: 'pending', reviewerId: null }, { reviewerId: reviewer.id }] }
      ]
    });
  });
});
