import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@balance/db';
import { PrismaPg } from '@prisma/adapter-pg';

import { apiMetrics } from '../observability/metrics';

function isNonLocalRuntime(): boolean {
  const value = (process.env.APP_ENV || process.env.NODE_ENV || '').trim().toLowerCase();
  return value === 'staging' || value === 'production';
}

function resolveDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (value) return value;
  if (isNonLocalRuntime()) {
    throw new Error('DATABASE_URL is required in staging and production');
  }
  return 'postgresql://balance:balance@postgres:5432/balance?schema=public';
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      // Do not fail the entire API process on startup:
      // - status endpoints must remain available
      // - readiness is handled separately
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async checkReady(): Promise<void> {
    await apiMetrics.observeReadiness('postgres', async () => {
      await this.$queryRaw`SELECT 1`;
    });
  }
}
