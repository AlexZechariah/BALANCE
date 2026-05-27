import type { INestApplication } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role, type DocumentStatus } from '@balance/db';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { ContractHttpExceptionFilter } from '../../src/common/contract-http-exception.filter';

export const seedUsers = {
  consumer: {
    email: 'consumer@balance.local',
    password: process.env.SEED_CONSUMER_PASSWORD || 'ci-consumer-password',
    displayName: 'Demo Consumer',
    role: Role.consumer
  },
  reviewer: {
    email: 'reviewer@balance.local',
    password: process.env.SEED_REVIEWER_PASSWORD || 'ci-reviewer-password',
    displayName: 'Demo Reviewer',
    role: Role.reviewer
  },
  reviewer2: {
    email: 'reviewer2@balance.local',
    password: process.env.SEED_REVIEWER_PASSWORD || 'ci-reviewer-password',
    displayName: 'Demo Reviewer 2',
    role: Role.reviewer
  },
  staff: {
    email: 'staff@balance.local',
    password: process.env.SEED_STAFF_PASSWORD || 'ci-staff-password',
    displayName: 'Demo Staff',
    role: Role.staff
  },
  admin: {
    email: 'admin@balance.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'ci-admin-password',
    displayName: 'Demo Admin',
    role: Role.system_admin
  },
  orgAdmin: {
    email: 'org-admin@balance.local',
    password: process.env.SEED_ADMIN_PASSWORD || 'ci-admin-password',
    displayName: 'Demo Org Admin',
    role: Role.admin
  }
} as const;

export type TestContext = {
  app: INestApplication;
  prisma: PrismaClient;
};

function ensureTestEnv() {
  process.env.APP_ENV ??= 'local';
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??= 'postgresql://balance:balance@127.0.0.1:5433/balance?schema=public';
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_SECRET ??= 'ci-placeholder-only';
  process.env.JWT_EXPIRES_IN ??= '1h';
  process.env.PASSWORD_PEPPER ??= 'ci-placeholder-only';
  process.env.STORAGE_DRIVER ??= 'filesystem';
  process.env.STORAGE_FILESYSTEM_ROOT ??= '/tmp/balance-api-test-storage';
  process.env.QUEUE_PROOF_NAME ??= 'queue_proof';
  process.env.EXTRACTION_QUEUE_NAME ??= 'document_extract';
  process.env.OCR_PROVIDER ??= 'paddleocr';
  process.env.EXTRACTION_PROVIDER_DEFAULT ??= 'paddleocr';
  process.env.EXTRACTION_ALLOW_LEGACY_TEXTRACT ??= 'false';
  process.env.TESSERACT_LANG ??= 'eng';
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

async function writeTestStorageObject(storageKey: string, contentType: string) {
  const root = path.resolve(process.env.OBJECT_STORAGE_FILESYSTEM_ROOT ?? process.env.STORAGE_FILESYSTEM_ROOT ?? '/tmp/balance-api-test-storage');
  const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (!normalized || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe test storage key: ${storageKey}`);
  }

  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Test storage key escaped root: ${storageKey}`);
  }

  await mkdir(path.dirname(target), { recursive: true });
  const body = contentType === 'application/pdf'
    ? Buffer.from('%PDF-1.4\n% Balance synthetic test document\n')
    : Buffer.from('Balance synthetic test document\n');
  await writeFile(target, body);
}

function peppered(password: string): string {
  return `${password}${process.env.PASSWORD_PEPPER || ''}`;
}

export async function createTestContext(): Promise<TestContext> {
  ensureTestEnv();

  const prisma = createPrismaClient();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new ContractHttpExceptionFilter());
  await app.init();

  return { app, prisma };
}

export async function closeTestContext(ctx: TestContext) {
  await ctx.app.close();
  await ctx.prisma.$disconnect();
}

export async function ensureSeedUsers(prisma: PrismaClient) {
  const demoOrg = await prisma.organization.upsert({
    where: { name: 'Demo Organization' },
    update: {},
    create: { name: 'Demo Organization' }
  });

  for (const user of Object.values(seedUsers)) {
    const organizationId = user.role === Role.admin || user.role === Role.staff ? demoOrg.id : null;
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        displayName: user.displayName,
        role: user.role,
        organizationId,
        passwordHash: await bcrypt.hash(peppered(user.password), 10)
      },
      create: {
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId,
        passwordHash: await bcrypt.hash(peppered(user.password), 10)
      }
    });
  }
}

export async function resetWorkflowData(prisma: PrismaClient) {
  await prisma.auditEvent.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.claim.deleteMany({});
  await prisma.extractionJob.deleteMany({});
  await prisma.documentField.deleteMany({});
  await prisma.document.deleteMany({});
}

export async function login(app: INestApplication, key: keyof typeof seedUsers) {
  const user = seedUsers[key];
  const response = await request(app.getHttpServer()).post('/auth/login').send({
    email: user.email,
    password: user.password
  });

  return {
    response,
    token: response.body.accessToken as string,
    user: response.body.user as { id: string; email: string; role: string; displayName: string; organizationId: string | null }
  };
}

export function auth(token: string) {
  return `Bearer ${token}`;
}

export async function createDocument(
  prisma: PrismaClient,
  input: {
    ownerId: string;
    status: DocumentStatus;
    label?: string | null;
    notes?: string | null;
    originalFilename?: string;
    merchantName?: string | null;
    documentDate?: string | null;
    transactionDate?: string | null;
    amountMinor?: number | null;
    currency?: string | null;
    category?: string | null;
    documentType?: string | null;
    organizationId?: string | null;
  }
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageKey = `documents/test-${suffix}/original.pdf`;
  const contentType = 'application/pdf';
  await writeTestStorageObject(storageKey, contentType);

  return prisma.document.create({
    data: {
      ownerId: input.ownerId,
      organizationId: input.organizationId ?? null,
      originalFilename: input.originalFilename ?? `receipt-${suffix}.pdf`,
      contentType,
      sizeBytes: 38,
      storageKey,
      status: input.status,
      label: input.label ?? null,
      notes: input.notes ?? null,
      merchantName: input.merchantName ?? 'Demo Merchant',
      documentDate: input.documentDate === undefined ? '2026-05-16' : input.documentDate,
      transactionDate: input.transactionDate === undefined ? (input.documentDate ?? '2026-05-16') : input.transactionDate,
      amountMinor: input.amountMinor === undefined ? 1299 : input.amountMinor,
      currency: input.currency === undefined ? 'AUD' : input.currency,
      category: input.category === undefined ? null : input.category,
      documentType: input.documentType ?? null
    }
  });
}
