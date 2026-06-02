import { validatePasswordPolicy, type ReviewStatus, type UserRole } from '@balance/types';
import type { AuthUser } from './api/auth';

export function canDecideReview(role: UserRole | null | undefined, status: ReviewStatus): boolean {
  return status === 'in_review' && (role === 'admin' || role === 'system_admin');
}

export function canDeleteEnterpriseMember(currentUser: AuthUser | null | undefined, member: AuthUser): boolean {
  return (member.role === 'staff' || member.role === 'reviewer') && member.id !== currentUser?.id;
}

export function validatePasswordComplexity(value: string): string | null {
  return validatePasswordPolicy(value);
}
