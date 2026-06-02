import type { INestApplication } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role, type DocumentStatus } from '@balance/db';
import { loadAppConfig } from '@balance/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { ContractHttpExceptionFilter } from '../../src/common/contract-http-exception.filter';
import { configureApiSecurity } from '../../src/security/browser-security';

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

const TEST_QUEUE_PREFIX = 'balance-test-';
const TEST_QUEUE_SUFFIX = process.env.BALANCE_TEST_QUEUE_SUFFIX ?? `${process.pid}`;

function testQueueName(name: string): string {
  return `${TEST_QUEUE_PREFIX}${name}-${TEST_QUEUE_SUFFIX}`;
}

function isGuardedTestQueueName(name: string | undefined): name is string {
  return Boolean(name?.startsWith(TEST_QUEUE_PREFIX));
}

function ensureTestEnv() {
  process.env.APP_ENV ??= 'local';
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??= 'postgresql://balance:balance@127.0.0.1:5433/balance?schema=public';
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.STORAGE_DRIVER ??= 'filesystem';
  process.env.STORAGE_FILESYSTEM_ROOT ??= '/tmp/balance-api-test-storage';
  process.env.QUEUE_PROOF_NAME ??= testQueueName('queue-proof');
  process.env.EXTRACTION_QUEUE_NAME ??= testQueueName('document-extract');
  process.env.OCR_PROVIDER ??= 'paddleocr';
  process.env.EXTRACTION_PROVIDER_DEFAULT ??= 'paddleocr';
  process.env.EXTRACTION_ALLOW_LEGACY_TEXTRACT ??= 'false';
  process.env.TESSERACT_LANG ??= 'eng';
}

async function obliterateGuardedTestQueue(name: string) {
  const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null
  });
  const queue = new Queue(name, { connection });

  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

async function cleanupGuardedTestQueues() {
  const queueNames = Array.from(new Set([
    process.env.QUEUE_PROOF_NAME,
    process.env.EXTRACTION_QUEUE_NAME
  ].filter(isGuardedTestQueueName)));

  for (const queueName of queueNames) {
    await obliterateGuardedTestQueue(queueName);
  }
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

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });
}

export type TestAuthSession = {
  cookieHeader: string;
  csrfToken: string;
};

export function sessionFromResponse(response: request.Response): TestAuthSession {
  const setCookieHeader = response.headers['set-cookie'];
  const cookies = (Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [])
    .map((cookie) => cookie.split(';', 1)[0])
    .filter(Boolean);
  const csrfToken = response.body.csrfToken as string | undefined;
  if (!cookies.length || !csrfToken) {
    throw new Error('Authenticated response did not include session cookies and CSRF token');
  }
  return {
    cookieHeader: cookies.join('; '),
    csrfToken
  };
}

export async function createTestContext(): Promise<TestContext> {
  ensureTestEnv();

  const prisma = createPrismaClient();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApiSecurity(app, loadAppConfig());
  app.useGlobalFilters(new ContractHttpExceptionFilter());
  await app.init();

  return { app, prisma };
}

export async function closeTestContext(ctx: TestContext) {
  await ctx.app.close();
  await cleanupGuardedTestQueues();
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
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(user.password)
      },
      create: {
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId,
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(user.password)
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
    session: sessionFromResponse(response),
    user: response.body.user as { id: string; email: string; role: string; displayName: string; organizationId: string | null; emailVerifiedAt: string | null }
  };
}

export function auth(session: TestAuthSession) {
  return (test: request.Test) => {
    test.set('Cookie', session.cookieHeader);
    test.set('x-csrf-token', session.csrfToken);
  };
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
