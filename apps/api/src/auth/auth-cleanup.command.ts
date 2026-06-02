import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { appLogger } from '../logging/logger.service';
import { AuthCleanupService } from './auth-cleanup.service';
import { AuthModule } from './auth.module';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AuthModule, { logger: false });
  try {
    const result = await app.get(AuthCleanupService).run();
    appLogger.info({ event: 'balance.auth.cleanup', ...result }, 'Authentication cleanup completed');
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  appLogger.error(
    {
      event: 'balance.auth.cleanup_failed',
      errorClass: error instanceof Error ? error.name : 'unknown'
    },
    'Authentication cleanup failed'
  );
  process.exitCode = 1;
});
