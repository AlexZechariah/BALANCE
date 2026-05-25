import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { ClaimStatus, DocumentStatus, Prisma, Role } from '@balance/db';
import { PrismaService } from '../prisma/prisma.service';
import { throwContractHttpError } from '../common/contract-errors';

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
export class EnterpriseService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private peppered(password: string): string {
    const pepper = (process.env.PASSWORD_PEPPER || '').trim();
    return `${password}${pepper}`;
  }

  private async requireOrgAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'admin' || !admin.organizationId) {
      throwContractHttpError(403, 'FORBIDDEN', 'Only enterprise admins can manage members', []);
    }
    return { ...admin, organizationId: admin.organizationId };
  }

  private async requireOrgMember(memberId: string, organizationId: string) {
    const member = await this.prisma.user.findUnique({ where: { id: memberId } });
    if (!member || member.organizationId !== organizationId) {
      throwContractHttpError(404, 'NOT_FOUND', 'Member not found', []);
    }
    return member;
  }

  private async assertNotLastAdmin(memberId: string, organizationId: string, nextRole: Role) {
    const member = await this.requireOrgMember(memberId, organizationId);
    if (member.role === 'admin' && nextRole !== 'admin') {
      const adminCount = await this.prisma.user.count({
        where: { organizationId, role: 'admin' }
      });
      if (adminCount <= 1) {
        throwContractHttpError(409, 'CONFLICT', 'Cannot demote the last admin', []);
      }
    }
    return member;
  }

  async createMember(adminId: string, email: string, password: string, displayName: string, role: string) {
    const admin = await this.requireOrgAdmin(adminId);

    // Check for existing email
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'A user with this email already exists', []);
    }

    const passwordHash = await bcrypt.hash(this.peppered(password), 10);
    const normalizedRole = (role || '').trim().toLowerCase();
    const validRoles: Role[] = ['staff', 'reviewer', 'admin'];
    const memberRole: Role = validRoles.includes(normalizedRole as Role) ? (normalizedRole as Role) : 'staff';

    const member = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        role: memberRole,
        organizationId: admin.organizationId,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        organizationId: true,
        createdAt: true,
      },
    });

    return { member };
  }

  async listMembers(adminId: string) {
    const admin = await this.requireOrgAdmin(adminId);

    const members = await this.prisma.user.findMany({
      where: { organizationId: admin.organizationId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        organizationId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return { members };
  }

  async deleteMember(adminId: string, memberId: string) {
    const admin = await this.requireOrgAdmin(adminId);
    const member = await this.requireOrgMember(memberId, admin.organizationId);

    if (member.id === admin.id) {
      throwContractHttpError(403, 'FORBIDDEN', 'Cannot delete your own account', []);
    }

    if (member.role === 'admin') {
      throwContractHttpError(403, 'FORBIDDEN', 'Cannot delete an admin member', []);
    }

    await this.prisma.user.delete({ where: { id: memberId } });

    return { ok: true };
  }

  async updateMemberRole(adminId: string, memberId: string, role: string | undefined) {
    const admin = await this.requireOrgAdmin(adminId);

    const normalizedRole = (role || '').trim().toLowerCase();
    if (!['staff', 'reviewer', 'admin'].includes(normalizedRole)) {
      throwContractHttpError(422, 'VALIDATION_ERROR', 'Role must be staff, reviewer, or admin', [{ path: 'role', message: 'Invalid role' }]);
    }

    await this.assertNotLastAdmin(memberId, admin.organizationId, normalizedRole as Role);

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data: { role: normalizedRole as Role },
      select: { id: true, email: true, displayName: true, role: true, organizationId: true, createdAt: true }
    });

    return { member: updated };
  }

  async updateMember(
    adminId: string,
    memberId: string,
    input: { displayName?: string | undefined; email?: string | undefined; role?: string | undefined }
  ) {
    const admin = await this.requireOrgAdmin(adminId);
    const normalizedRole = input.role?.trim().toLowerCase();
    if (normalizedRole && !['staff', 'reviewer', 'admin'].includes(normalizedRole)) {
      throwContractHttpError(422, 'VALIDATION_ERROR', 'Role must be staff, reviewer, or admin', [{ path: 'role', message: 'Invalid role' }]);
    }

    const member = normalizedRole
      ? await this.assertNotLastAdmin(memberId, admin.organizationId, normalizedRole as Role)
      : await this.requireOrgMember(memberId, admin.organizationId);

    const data: { displayName?: string; email?: string; role?: Role } = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.email !== undefined && input.email !== member.email) data.email = input.email;
    if (normalizedRole) data.role = normalizedRole as Role;

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data,
      select: { id: true, email: true, displayName: true, role: true, organizationId: true, createdAt: true }
    }).catch((error: unknown) => {
      if (isPrismaKnownErrorCode(error, 'P2002') && prismaTargetIncludes(error, 'email')) {
        throwContractHttpError(409, 'AUTH_EMAIL_EXISTS', 'A user with this email already exists', []);
      }
      throw error;
    });

    return { member: updated };
  }

  async resetMemberPassword(adminId: string, memberId: string, password: string) {
    const admin = await this.requireOrgAdmin(adminId);
    const member = await this.requireOrgMember(memberId, admin.organizationId);
    if (member.id === admin.id) {
      throwContractHttpError(403, 'FORBIDDEN', 'Use account settings to change your own password', []);
    }

    await this.prisma.user.update({
      where: { id: memberId },
      data: { passwordHash: await bcrypt.hash(this.peppered(password), 10) }
    });

    return { ok: true };
  }

  async listClaims(input: {
    actorId: string;
    actorRole: string;
    organizationId: string | null;
    limit: number;
    offset: number;
    status?: string;
  }) {
    if (input.actorRole !== 'admin' && input.actorRole !== 'reviewer' && input.actorRole !== 'system_admin') {
      throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
    }
    if (!input.organizationId) {
      throwContractHttpError(403, 'FORBIDDEN', 'Only enterprise admins can list claims', []);
    }

    if (input.actorRole === 'admin') {
      const admin = await this.prisma.user.findUnique({ where: { id: input.actorId } });
      if (!admin || admin.role !== 'admin' || admin.organizationId !== input.organizationId) {
        throwContractHttpError(403, 'FORBIDDEN', 'Only enterprise admins can list claims', []);
      }
    }

    const where: Prisma.ClaimWhereInput = {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status as ClaimStatus } : { status: { not: 'draft' } })
    };

    const [claims, total] = await Promise.all([
      this.prisma.claim.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        take: input.limit,
        skip: input.offset,
        include: {
          consumer: { select: { id: true, displayName: true, email: true } },
          document: {
            select: {
              id: true,
              ownerId: true,
              originalFilename: true,
              merchantName: true,
              amountMinor: true,
              currency: true,
              status: true
            }
          },
          review: { select: { id: true, status: true, decisionNote: true, reviewerId: true, decidedAt: true } }
        }
      }),
      this.prisma.claim.count({ where })
    ]);

    return {
      claims: claims.map((claim) => ({
        id: claim.id,
        documentId: claim.documentId,
        consumerId: claim.consumerId,
        status: claim.status,
        purpose: claim.purpose,
        note: claim.note,
        submittedAt: claim.submittedAt?.toISOString() ?? null,
        decidedAt: claim.decidedAt?.toISOString() ?? null,
        consumer: claim.consumer,
        document: {
          id: claim.document.id,
          ownerId: claim.document.ownerId,
          originalFilename: claim.document.originalFilename,
          merchantName: claim.document.merchantName,
          amountMinor: claim.document.amountMinor,
          currency: claim.document.currency,
          status: claim.document.status
        },
        review: claim.review
          ? {
              id: claim.review.id,
              status: claim.review.status,
              decisionNote: claim.review.decisionNote,
              reviewerId: claim.review.reviewerId,
              decidedAt: claim.review.decidedAt?.toISOString() ?? null
            }
          : null
      })),
      page: { limit: input.limit, offset: input.offset, total }
    };
  }

  async listDocuments(input: {
    actorId: string;
    actorRole: string;
    organizationId: string | null;
    query: {
      limit?: number;
      offset?: number;
      status?: DocumentStatus;
      search?: string;
      category?: string;
      from?: string;
      to?: string;
      minAmount?: number;
      maxAmount?: number;
    };
  }) {
    if (input.actorRole !== 'admin' && input.actorRole !== 'system_admin') {
      throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
    }
    if (!input.organizationId) {
      throwContractHttpError(403, 'FORBIDDEN', 'Only enterprise admins can list documents', []);
    }

    if (input.actorRole === 'admin') {
      const admin = await this.prisma.user.findUnique({ where: { id: input.actorId } });
      if (!admin || admin.role !== 'admin' || admin.organizationId !== input.organizationId) {
        throwContractHttpError(403, 'FORBIDDEN', 'Only enterprise admins can list documents', []);
      }
    }

    const limit = input.query.limit ?? 20;
    const offset = input.query.offset ?? 0;

    const where: Prisma.DocumentWhereInput = {
      organizationId: input.organizationId,
      ...(input.query.status ? { status: input.query.status } : {}),
      ...(input.query.category ? { category: input.query.category } : {})
    };

    if (input.query.from || input.query.to) {
      where.OR = [
        {
          documentDate: {
            ...(input.query.from ? { gte: input.query.from } : {}),
            ...(input.query.to ? { lte: input.query.to } : {})
          }
        },
        {
          transactionDate: {
            ...(input.query.from ? { gte: input.query.from } : {}),
            ...(input.query.to ? { lte: input.query.to } : {})
          }
        }
      ];
    }

    if (input.query.minAmount != null || input.query.maxAmount != null) {
      where.amountMinor = {
        ...(input.query.minAmount != null ? { gte: input.query.minAmount } : {}),
        ...(input.query.maxAmount != null ? { lte: input.query.maxAmount } : {})
      };
    }

    if (input.query.search) {
      const search = input.query.search.trim();
      const searchWhere: Prisma.DocumentWhereInput = {
        OR: [
          { originalFilename: { contains: search, mode: 'insensitive' } },
          { merchantName: { contains: search, mode: 'insensitive' } },
          { label: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { owner: { displayName: { contains: search, mode: 'insensitive' } } },
          { owner: { email: { contains: search, mode: 'insensitive' } } },
          { fields: { some: { value: { contains: search, mode: 'insensitive' } } } },
          { fields: { some: { correctedValue: { contains: search, mode: 'insensitive' } } } }
        ]
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchWhere];
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          owner: { select: { id: true, email: true, displayName: true, role: true } },
          claim: { select: { id: true, status: true } },
          review: { select: { id: true, status: true } }
        }
      }),
      this.prisma.document.count({ where })
    ]);

    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        ownerId: doc.ownerId,
        organizationId: doc.organizationId,
        originalFilename: doc.originalFilename,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
        status: doc.status,
        label: doc.label,
        notes: doc.notes,
        category: doc.category,
        tags: Array.isArray(doc.tags) ? doc.tags : [],
        merchantName: doc.merchantName,
        documentDate: doc.documentDate,
        amountMinor: doc.amountMinor,
        currency: doc.currency,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        owner: doc.owner,
        claim: doc.claim,
        review: doc.review
      })),
      page: { limit, offset, total }
    };
  }

  async getDocumentOwner(input: { actorId: string; actorRole: string; organizationId: string | null; documentId: string }) {
    if (input.actorRole !== 'admin' && input.actorRole !== 'system_admin') {
      throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
    }
    if (!input.organizationId && input.actorRole !== 'system_admin') {
      throwContractHttpError(403, 'FORBIDDEN', 'Only enterprise admins can view documents', []);
    }

    const document = await this.prisma.document.findUnique({
      where: { id: input.documentId },
      select: {
        id: true,
        ownerId: true,
        organizationId: true,
        owner: { select: { id: true, email: true, displayName: true, role: true } }
      }
    });

    if (!document) {
      throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
    }

    if (input.actorRole !== 'system_admin' && document.organizationId !== input.organizationId) {
      throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
    }

    return { document };
  }
}
