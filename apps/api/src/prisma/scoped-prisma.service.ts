import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@balance/db';

import { PrismaScopeService } from '../authorization/prisma-scope.service';
import type { CurrentActor } from '../authorization/current-actor';

import { PrismaService } from './prisma.service';

export type ScopedActorInput = {
  id: string;
  email?: string;
  role: string;
  organizationId?: string | null | undefined;
};

type ScopedPrismaClient = Pick<Prisma.TransactionClient, 'document' | 'claim' | 'review' | 'budget' | 'user' | 'auditEvent'>;

function actorFrom(input: ScopedActorInput): CurrentActor {
  return {
    id: input.id,
    email: input.email ?? '',
    role: input.role,
    organizationId: input.organizationId ?? null
  };
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

function andWhere<T extends object>(...parts: Array<T | undefined>): T {
  const present = parts.filter((part): part is T => Boolean(part && hasKeys(part)));
  if (present.length === 0) return {} as T;
  if (present.length === 1) return present[0]!;
  return { AND: present } as T;
}

@Injectable()
export class ScopedPrismaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: ScopedPrismaClient,
    @Inject(PrismaScopeService) private readonly scopes: PrismaScopeService
  ) {}

  actor(input: ScopedActorInput): CurrentActor {
    return actorFrom(input);
  }

  documentWhere(actor: ScopedActorInput, where?: Prisma.DocumentWhereInput): Prisma.DocumentWhereInput {
    return andWhere(this.scopes.documentWhere(actorFrom(actor)), where);
  }

  documentObjectWhere(actor: ScopedActorInput, id: string, where?: Prisma.DocumentWhereInput): Prisma.DocumentWhereInput {
    return andWhere({ id }, this.scopes.documentWhere(actorFrom(actor)), where);
  }

  claimWhere(actor: ScopedActorInput, where?: Prisma.ClaimWhereInput): Prisma.ClaimWhereInput {
    return andWhere(this.scopes.claimWhere(actorFrom(actor)), where);
  }

  claimObjectWhere(actor: ScopedActorInput, id: string, where?: Prisma.ClaimWhereInput): Prisma.ClaimWhereInput {
    return andWhere({ id }, this.scopes.claimWhere(actorFrom(actor)), where);
  }

  reviewWhere(actor: ScopedActorInput, where?: Prisma.ReviewWhereInput): Prisma.ReviewWhereInput {
    return andWhere(this.scopes.reviewWhere(actorFrom(actor)), where);
  }

  reviewObjectWhere(actor: ScopedActorInput, id: string, where?: Prisma.ReviewWhereInput): Prisma.ReviewWhereInput {
    return andWhere({ id }, this.scopes.reviewWhere(actorFrom(actor)), where);
  }

  budgetWhere(actor: ScopedActorInput, where?: Prisma.BudgetWhereInput): Prisma.BudgetWhereInput {
    return andWhere(this.scopes.budgetWhere(actorFrom(actor)), where);
  }

  budgetObjectWhere(actor: ScopedActorInput, id: string, where?: Prisma.BudgetWhereInput): Prisma.BudgetWhereInput {
    return andWhere({ id }, this.scopes.budgetWhere(actorFrom(actor)), where);
  }

  membershipWhere(actor: ScopedActorInput, where?: Prisma.UserWhereInput): Prisma.UserWhereInput {
    return andWhere(this.scopes.membershipWhere(actorFrom(actor)), where);
  }

  auditEventWhere(actor: ScopedActorInput, where?: Prisma.AuditEventWhereInput): Prisma.AuditEventWhereInput {
    return andWhere(this.scopes.auditEventWhere(actorFrom(actor)), where);
  }

  async findDocument<T extends Prisma.DocumentFindFirstArgs>(
    actor: ScopedActorInput,
    id: string,
    args: T,
    client: ScopedPrismaClient = this.prisma
  ): Promise<Prisma.DocumentGetPayload<T> | null> {
    return client.document.findFirst({
      ...args,
      where: this.documentObjectWhere(actor, id, args.where)
    } as Prisma.DocumentFindFirstArgs) as Promise<Prisma.DocumentGetPayload<T> | null>;
  }

  async findClaim<T extends Prisma.ClaimFindFirstArgs>(
    actor: ScopedActorInput,
    id: string,
    args: T,
    client: ScopedPrismaClient = this.prisma
  ): Promise<Prisma.ClaimGetPayload<T> | null> {
    return client.claim.findFirst({
      ...args,
      where: this.claimObjectWhere(actor, id, args.where)
    } as Prisma.ClaimFindFirstArgs) as Promise<Prisma.ClaimGetPayload<T> | null>;
  }

  async findReview<T extends Prisma.ReviewFindFirstArgs>(
    actor: ScopedActorInput,
    id: string,
    args: T,
    client: ScopedPrismaClient = this.prisma
  ): Promise<Prisma.ReviewGetPayload<T> | null> {
    return client.review.findFirst({
      ...args,
      where: this.reviewObjectWhere(actor, id, args.where)
    } as Prisma.ReviewFindFirstArgs) as Promise<Prisma.ReviewGetPayload<T> | null>;
  }

  async findBudget<T extends Prisma.BudgetFindFirstArgs>(
    actor: ScopedActorInput,
    id: string,
    args: T,
    client: ScopedPrismaClient = this.prisma
  ): Promise<Prisma.BudgetGetPayload<T> | null> {
    return client.budget.findFirst({
      ...args,
      where: this.budgetObjectWhere(actor, id, args.where)
    } as Prisma.BudgetFindFirstArgs) as Promise<Prisma.BudgetGetPayload<T> | null>;
  }

  async findMembership<T extends Prisma.UserFindFirstArgs>(
    actor: ScopedActorInput,
    id: string,
    args: T,
    client: ScopedPrismaClient = this.prisma
  ): Promise<Prisma.UserGetPayload<T> | null> {
    return client.user.findFirst({
      ...args,
      where: andWhere({ id }, this.membershipWhere(actor, args.where))
    } as Prisma.UserFindFirstArgs) as Promise<Prisma.UserGetPayload<T> | null>;
  }

  async documentExists(id: string): Promise<boolean> {
    const record = await this.prisma.document.findFirst({ where: { id }, select: { id: true } });
    return Boolean(record);
  }

  async claimExists(id: string): Promise<boolean> {
    const record = await this.prisma.claim.findFirst({ where: { id }, select: { id: true } });
    return Boolean(record);
  }

  async reviewExists(id: string): Promise<boolean> {
    const record = await this.prisma.review.findFirst({ where: { id }, select: { id: true } });
    return Boolean(record);
  }

  async budgetExists(id: string): Promise<boolean> {
    const record = await this.prisma.budget.findFirst({ where: { id }, select: { id: true } });
    return Boolean(record);
  }
}
