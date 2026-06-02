import { SetMetadata } from '@nestjs/common';

export const VERIFIED_EMAIL_ROLES_KEY = 'balance:verified-email-roles';

export const RequireVerifiedEmail = () => SetMetadata(VERIFIED_EMAIL_ROLES_KEY, []);

export const RequireVerifiedEmailForRoles = (...roles: string[]) => SetMetadata(VERIFIED_EMAIL_ROLES_KEY, roles);
