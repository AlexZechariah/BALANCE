import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAppConfig } from '@balance/config';

import { AppController } from '../src/app.controller';
import { ContractHttpExceptionFilter } from '../src/common/contract-http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { ExtractionQueueService } from '../src/queue/extraction-queue.service';

describe('Balance API status endpoints', () => {
  let app: INestApplication;
  const prisma = { checkReady: async () => undefined };
  const queue = { checkReady: async () => undefined };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ExtractionQueueService, useValue: queue }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ContractHttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('serves /health', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'balance-api',
      app: 'Balance',
      environment: 'local',
      version: loadAppConfig().appVersion
    });
  });

  it('serves /ready', async () => {
    const response = await request(app.getHttpServer()).get('/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ready',
      service: 'balance-api',
      app: 'Balance',
      environment: 'local',
      version: loadAppConfig().appVersion
    });
  });

  it('returns 503 from /ready when a dependency check fails', async () => {
    const original = queue.checkReady;
    queue.checkReady = async () => {
      throw new Error('redis unavailable');
    };

    const response = await request(app.getHttpServer()).get('/ready').expect(503);

    expect(response.body).toMatchObject({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        details: []
      }
    });

    queue.checkReady = original;
  });

  it('serves /version', async () => {
    const response = await request(app.getHttpServer()).get('/version').expect(200);

    expect(response.body).toMatchObject({
      service: 'balance-api',
      app: 'Balance',
      environment: 'local',
      version: loadAppConfig().appVersion,
      commit: 'local',
      build: 'local-build'
    });
  });
});
