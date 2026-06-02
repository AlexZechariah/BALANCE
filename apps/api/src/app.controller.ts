import { Controller, Get, Inject } from '@nestjs/common';
import { loadAppConfig } from '@balance/config';
import type { ApiStatusPayload, ApiVersionPayload } from '@balance/types';

import { throwContractHttpError } from './common/contract-errors';
import { appLogger } from './logging/logger.service';
import { PrismaService } from './prisma/prisma.service';
import { ExtractionQueueService } from './queue/extraction-queue.service';

@Controller()
export class AppController {
  private readonly config = loadAppConfig();
  private readonly service = 'balance-api' as const;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExtractionQueueService) private readonly extractionQueue: ExtractionQueueService
  ) {}

  @Get('health')
  getHealth(): ApiStatusPayload {
    return {
      status: 'ok',
      service: this.service,
      app: this.config.appName,
      environment: this.config.appEnv,
      version: this.config.appVersion
    };
  }

  @Get('ready')
  async getReady(): Promise<ApiStatusPayload> {
    try {
      await this.prisma.checkReady();
      await this.extractionQueue.checkReady();
    } catch (err) {
      appLogger.warn({ err: { name: err instanceof Error ? err.name : typeof err } }, 'Readiness dependency check failed');
      throwContractHttpError(503, 'SERVICE_UNAVAILABLE', 'Service unavailable', []);
    }

    return {
      status: 'ready',
      service: this.service,
      app: this.config.appName,
      environment: this.config.appEnv,
      version: this.config.appVersion
    };
  }

  @Get('version')
  getVersion(): ApiVersionPayload {
    return {
      service: this.service,
      app: this.config.appName,
      environment: this.config.appEnv,
      version: this.config.appVersion,
      commit: this.config.gitCommit,
      build: this.config.buildId
    };
  }
}
