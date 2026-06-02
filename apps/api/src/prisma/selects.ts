import type { Prisma } from '@balance/db';

export const authUserWithPasswordSelect = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  displayName: true,
  organizationId: true,
  emailVerifiedAt: true
} satisfies Prisma.UserSelect;

export const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  displayName: true,
  organizationId: true,
  emailVerifiedAt: true
} satisfies Prisma.UserSelect;

export const sessionUserSelect = {
  id: true,
  role: true,
  email: true,
  organizationId: true,
  emailVerifiedAt: true
} satisfies Prisma.UserSelect;
