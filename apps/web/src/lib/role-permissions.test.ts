import { describe, expect, it } from 'vitest';

import { homeForRole } from './auth-routing';
import { canDecideReview, canDeleteEnterpriseMember, validatePasswordComplexity } from './role-permissions';
import type { AuthUser } from './api/auth';

const currentAdmin: AuthUser = {
  id: 'admin-1',
  email: 'admin@balance.local',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  role: 'admin',
  displayName: 'Org Admin',
  organizationId: 'org-1'
};

function member(id: string, role: AuthUser['role']): AuthUser {
  return {
    id,
    email: `${id}@balance.local`,
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    role,
    displayName: id,
    organizationId: 'org-1'
  };
}

describe('role routing and permission helpers', () => {
  it('routes roles to their default application area', () => {
    expect(homeForRole('consumer')).toBe('/app');
    expect(homeForRole('staff')).toBe('/enterprise/documents');
    expect(homeForRole('reviewer')).toBe('/enterprise/reviews');
    expect(homeForRole('admin')).toBe('/enterprise/documents');
    expect(homeForRole('system_admin')).toBe('/app/admin');
  });

  it('allows only org and system admins to decide in-review reviews', () => {
    expect(canDecideReview('admin', 'in_review')).toBe(true);
    expect(canDecideReview('system_admin', 'in_review')).toBe(true);
    expect(canDecideReview('staff', 'in_review')).toBe(false);
    expect(canDecideReview('reviewer', 'in_review')).toBe(false);
    expect(canDecideReview('admin', 'pending')).toBe(false);
  });

  it('protects admins and self from member deletion', () => {
    expect(canDeleteEnterpriseMember(currentAdmin, member('staff-1', 'staff'))).toBe(true);
    expect(canDeleteEnterpriseMember(currentAdmin, member('admin-2', 'admin'))).toBe(false);
    expect(canDeleteEnterpriseMember(currentAdmin, currentAdmin)).toBe(false);
  });

  it('matches member password validation to the shared account password policy', () => {
    expect(validatePasswordComplexity('short password')).toContain('at least 15');
    expect(validatePasswordComplexity('balance password')).toContain('too common');
    expect(validatePasswordComplexity('valid local passphrase 1')).toBeNull();
  });
});
