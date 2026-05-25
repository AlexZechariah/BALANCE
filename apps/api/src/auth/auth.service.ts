import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { throwContractHttpError } from '../common/contract-errors';
import { JwtService } from './jwt.service';

type PublicUser = {
  id: string;
  email: string;
  role: string;
  displayName: string;
  organizationId: string | null;
};

function isPrismaKnownErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function prismaTargetIncludes(error: unknown, targetName: string): boolean {
  if (typeof error !== 'object' || error === null || !('meta' in error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes(targetName);
  return typeof target === 'string' && target.includes(targetName);
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService
  ) {}

  private peppered(password: string): string {
    const pepper = (process.env.PASSWORD_PEPPER || '').trim();
    return `${password}${pepper}`;
  }

  private toPublicUser(user: { id: string; email: string; role: string; displayName: string; organizationId: string | null }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      organizationId: user.organizationId
    };
  }

  async login(email: string, password: string): Promise<{ user: PublicUser; accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Do not reveal whether the email exists.
    if (!user) {
      throwContractHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials', []);
    }

    const ok = await bcrypt.compare(this.peppered(password), user.passwordHash);
    if (!ok) {
      throwContractHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials', []);
    }

    const accessToken = await this.jwt.sign({ sub: user.id, role: user.role, email: user.email });
    return { user: this.toPublicUser(user), accessToken };
  }

  async me(userId: string): Promise<{ user: PublicUser }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // Token may be valid but user deleted/hidden; treat as invalid.
      throwContractHttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token', []);
    }
    return { user: this.toPublicUser(user) };
  }

  async register(
    email: string,
    password: string,
    displayName: string,
    orgName?: string
  ): Promise<{ user: PublicUser; accessToken: string }> {
    const passwordHash = await bcrypt.hash(this.peppered(password), 10);

    const user = await this.prisma
      .$transaction(async (tx) => {
        // Check for existing user — do not reveal whether email exists.
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists', []);
        }

        let organizationId: string | undefined;

        if (orgName) {
          const existingOrg = await tx.organization.findUnique({ where: { name: orgName } });
          if (existingOrg) {
            throwContractHttpError(409, 'ORG_NAME_EXISTS', 'An organization with this name already exists', []);
          }

          const org = await tx.organization.create({
            data: { name: orgName }
          });
          organizationId = org.id;
        }

        return tx.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            role: orgName ? 'admin' : 'consumer',
            organizationId: organizationId ?? null
          }
        });
      })
      .catch((error: unknown) => {
        if (isPrismaKnownErrorCode(error, 'P2002')) {
          if (prismaTargetIncludes(error, 'name')) {
            throwContractHttpError(409, 'ORG_NAME_EXISTS', 'An organization with this name already exists', []);
          }
          if (prismaTargetIncludes(error, 'email')) {
            throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists', []);
          }
        }
        throw error;
      });

    const accessToken = await this.jwt.sign({ sub: user.id, role: user.role, email: user.email });
    return { user: this.toPublicUser(user), accessToken };
  }

  async updateAccount(
    userId: string,
    input: { displayName?: string | undefined; email?: string | undefined; currentPassword?: string | undefined; newPassword?: string | undefined }
  ): Promise<{ user: PublicUser }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throwContractHttpError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token', []);
    }

    const sensitiveChange = Boolean(input.email && input.email !== user.email) || Boolean(input.newPassword);
    if (sensitiveChange) {
      if (!input.currentPassword) {
        throwContractHttpError(422, 'VALIDATION_ERROR', 'Current password is required', [
          { path: 'currentPassword', message: 'Current password is required for email or password changes' }
        ]);
      }

      const ok = await bcrypt.compare(this.peppered(input.currentPassword), user.passwordHash);
      if (!ok) {
        throwContractHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Current password is incorrect', []);
      }
    }

    const data: { displayName?: string; email?: string; passwordHash?: string } = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email && input.email !== user.email) data.email = input.email;
    if (input.newPassword) data.passwordHash = await bcrypt.hash(this.peppered(input.newPassword), 10);

    if (Object.keys(data).length === 0) {
      return { user: this.toPublicUser(user) };
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data
    }).catch((error: unknown) => {
      if (isPrismaKnownErrorCode(error, 'P2002') && prismaTargetIncludes(error, 'email')) {
        throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'An account with this email already exists', []);
      }
      throw error;
    });

    return { user: this.toPublicUser(updated) };
  }
}
