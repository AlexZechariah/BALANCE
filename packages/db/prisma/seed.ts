import {
  ClaimStatus,
  DocumentStatus,
  EntityType,
  PrismaClient,
  ReviewStatus,
  Role,
  StorageDriver
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

const LOCAL_PLACEHOLDER_VALUES = new Set([
  '',
  'replace-this-local-only',
  'change-me',
  'change-me-local-only',
  'change-me-for-local-only',
  'balance',
  'password'
]);

function appEnv(): string {
  return (process.env.APP_ENV || process.env.NODE_ENV || 'local').trim().toLowerCase();
}

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value.trim();
  if (appEnv() !== 'local') {
    throw new Error(`${name} is required in ${appEnv()}`);
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is required`);
}

function requiredSeedSecret(name: string): string {
  const value = requiredEnv(name, 'replace-this-local-only');
  if (appEnv() !== 'local' && LOCAL_PLACEHOLDER_VALUES.has(value.trim().toLowerCase())) {
    throw new Error(`${name} must be a non-placeholder value in ${appEnv()}`);
  }
  return value;
}

function assertSeedMode(): 'local' | 'smoke' {
  const env = appEnv();
  const modeArgument = process.argv.find((value) => value.startsWith('--mode='));
  const mode = (modeArgument?.slice('--mode='.length) || 'local').trim().toLowerCase();

  if (env === 'production') {
    throw new Error('Seeding production is prohibited');
  }
  if (mode === 'local' && env === 'local') return 'local';
  if (mode === 'smoke' && env === 'staging' && process.env.SEED_SMOKE_CONFIRM === 'seed-balance-staging') {
    return 'smoke';
  }
  if (mode === 'smoke') {
    throw new Error('Smoke seeding requires APP_ENV=staging and SEED_SMOKE_CONFIRM=seed-balance-staging');
  }
  throw new Error('Local seeding requires APP_ENV=local');
}

async function main() {
  const mode = assertSeedMode();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for seed');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const consumerPassword = requiredSeedSecret('SEED_CONSUMER_PASSWORD');
  const staffPassword = requiredSeedSecret('SEED_STAFF_PASSWORD');
  const reviewerPassword = requiredSeedSecret('SEED_REVIEWER_PASSWORD');
  const adminPassword = requiredSeedSecret('SEED_ADMIN_PASSWORD');
  const systemAdminPassword = requiredSeedSecret('SEED_SYSTEM_ADMIN_PASSWORD');
  const consumerHash = await hashPassword(consumerPassword);
  const staffHash = await hashPassword(staffPassword);
  const reviewerHash = await hashPassword(reviewerPassword);
  const adminHash = await hashPassword(adminPassword);
  const systemAdminHash = await hashPassword(systemAdminPassword);
  const verifiedAt = new Date('2026-01-01T00:00:00.000Z');
  const suffix = mode === 'smoke' ? 'staging-smoke.balance.invalid' : 'local-seed.balance.invalid';

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.upsert({
      where: { name: `Balance ${mode} seed organization` },
      update: {},
      create: { name: `Balance ${mode} seed organization` }
    });

    const consumer = await tx.user.upsert({
      where: { email: `verified-consumer@${suffix}` },
      update: {
        displayName: 'Verified Consumer',
        role: Role.consumer,
        organizationId: null,
        emailVerifiedAt: verifiedAt,
        passwordHash: consumerHash
      },
      create: {
        email: `verified-consumer@${suffix}`,
        displayName: 'Verified Consumer',
        role: Role.consumer,
        emailVerifiedAt: verifiedAt,
        passwordHash: consumerHash
      }
    });

    await tx.user.upsert({
      where: { email: `unverified-consumer@${suffix}` },
      update: {
        displayName: 'Unverified Consumer',
        role: Role.consumer,
        organizationId: null,
        emailVerifiedAt: null,
        passwordHash: consumerHash
      },
      create: {
        email: `unverified-consumer@${suffix}`,
        displayName: 'Unverified Consumer',
        role: Role.consumer,
        passwordHash: consumerHash
      }
    });

    const staff = await tx.user.upsert({
      where: { email: `staff@${suffix}` },
      update: {
        displayName: 'Organization Staff',
        role: Role.staff,
        organizationId: organization.id,
        emailVerifiedAt: verifiedAt,
        passwordHash: staffHash
      },
      create: {
        email: `staff@${suffix}`,
        displayName: 'Organization Staff',
        role: Role.staff,
        organizationId: organization.id,
        emailVerifiedAt: verifiedAt,
        passwordHash: staffHash
      }
    });

    const reviewer = await tx.user.upsert({
      where: { email: `reviewer@${suffix}` },
      update: {
        displayName: 'Organization Reviewer',
        role: Role.reviewer,
        organizationId: organization.id,
        emailVerifiedAt: verifiedAt,
        passwordHash: reviewerHash
      },
      create: {
        email: `reviewer@${suffix}`,
        displayName: 'Organization Reviewer',
        role: Role.reviewer,
        organizationId: organization.id,
        emailVerifiedAt: verifiedAt,
        passwordHash: reviewerHash
      }
    });

    await tx.user.upsert({
      where: { email: `admin@${suffix}` },
      update: {
        displayName: 'Organization Admin',
        role: Role.admin,
        organizationId: organization.id,
        emailVerifiedAt: verifiedAt,
        passwordHash: adminHash
      },
      create: {
        email: `admin@${suffix}`,
        displayName: 'Organization Admin',
        role: Role.admin,
        organizationId: organization.id,
        emailVerifiedAt: verifiedAt,
        passwordHash: adminHash
      }
    });

    await tx.user.upsert({
      where: { email: `system-admin@${suffix}` },
      update: {
        displayName: 'System Admin',
        role: Role.system_admin,
        organizationId: null,
        emailVerifiedAt: verifiedAt,
        passwordHash: systemAdminHash
      },
      create: {
        email: `system-admin@${suffix}`,
        displayName: 'System Admin',
        role: Role.system_admin,
        emailVerifiedAt: verifiedAt,
        passwordHash: systemAdminHash
      }
    });

    const documentId = mode === 'smoke'
      ? '00000000-0000-4000-8000-000000000101'
      : '00000000-0000-4000-8000-000000000001';
    const document = await tx.document.upsert({
      where: { id: documentId },
      update: {
        ownerId: staff.id,
        organizationId: organization.id,
        status: DocumentStatus.submitted
      },
      create: {
        id: documentId,
        ownerId: staff.id,
        organizationId: organization.id,
        originalFilename: 'synthetic-seed-receipt.pdf',
        contentType: 'application/pdf',
        sizeBytes: 128,
        storageDriver: StorageDriver.filesystem,
        storageKey: `seed/${mode}/synthetic-seed-receipt.pdf`,
        storageSha256: '0000000000000000000000000000000000000000000000000000000000000000',
        storageSizeBytes: 128,
        storageContentType: 'application/pdf',
        pageCount: 1,
        status: DocumentStatus.submitted,
        previewAvailable: false,
        merchantName: 'Synthetic Merchant',
        documentDate: '2026-01-01',
        amountMinor: 1250,
        currency: 'MYR',
        qualityWarnings: [],
        extractionSummary: { source: 'synthetic_seed' }
      }
    });

    const claim = await tx.claim.upsert({
      where: { documentId: document.id },
      update: {
        consumerId: consumer.id,
        organizationId: organization.id,
        status: ClaimStatus.submitted,
        purpose: 'Synthetic smoke claim'
      },
      create: {
        documentId: document.id,
        consumerId: consumer.id,
        organizationId: organization.id,
        status: ClaimStatus.submitted,
        purpose: 'Synthetic smoke claim',
        submittedAt: verifiedAt
      }
    });

    const review = await tx.review.upsert({
      where: { claimId: claim.id },
      update: {
        documentId: document.id,
        reviewerId: reviewer.id,
        status: ReviewStatus.in_review
      },
      create: {
        claimId: claim.id,
        documentId: document.id,
        reviewerId: reviewer.id,
        status: ReviewStatus.in_review
      }
    });

    await tx.budget.upsert({
      where: {
        userId_category_month: {
          userId: consumer.id,
          category: 'general',
          month: '2026-01'
        }
      },
      update: { amountMinor: 50000, currency: 'MYR' },
      create: {
        userId: consumer.id,
        category: 'general',
        month: '2026-01',
        amountMinor: 50000,
        currency: 'MYR'
      }
    });

    const auditId = mode === 'smoke'
      ? '00000000-0000-4000-8000-000000000102'
      : '00000000-0000-4000-8000-000000000002';
    await tx.auditEvent.upsert({
      where: { id: auditId },
      update: {
        actorId: reviewer.id,
        organizationId: organization.id,
        documentId: document.id,
        claimId: claim.id,
        reviewId: review.id
      },
      create: {
        id: auditId,
        action: 'seed.workflow.ready',
        entityType: EntityType.review,
        entityId: review.id,
        actorId: reviewer.id,
        actorRole: Role.reviewer,
        message: 'Synthetic seed workflow is ready for smoke validation',
        metadata: { synthetic: true, mode },
        organizationId: organization.id,
        documentId: document.id,
        claimId: claim.id,
        reviewId: review.id
      }
    });
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });
}
