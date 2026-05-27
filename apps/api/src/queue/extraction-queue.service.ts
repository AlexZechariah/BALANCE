import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { throwContractHttpError } from '../common/contract-errors';
import type { ObjectReference } from '../storage/object-storage.types';

import { DEFAULT_EXTRACTION_JOB_NAME, DEFAULT_EXTRACTION_QUEUE_NAME } from './extraction-queue.constants';

export type ExtractionJobPayload = {
  documentId: string;
  extractionJobId: string;
  pipelineVersion: string;
  objectRef: ObjectReference;
  storageDriver?: string;
  storageKey: string;
  contentType: string;
  originalFilename: string;
  provider: string;
  pageLimit?: number | null;
};

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is required`);
}

@Injectable()
export class ExtractionQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor() {
    const redisUrl = requiredEnv('REDIS_URL', 'redis://redis:6379');
    const queueName = requiredEnv('EXTRACTION_QUEUE_NAME', DEFAULT_EXTRACTION_QUEUE_NAME);

    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(queueName, { connection: this.connection });
  }

  async enqueue(payload: ExtractionJobPayload): Promise<void> {
    try {
      await this.queue.add(DEFAULT_EXTRACTION_JOB_NAME, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false
      });
    } catch {
      throwContractHttpError(503, 'SERVICE_UNAVAILABLE', 'Queue unavailable', []);
    }
  }

  async checkReady(): Promise<void> {
    await this.connection.ping();
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
