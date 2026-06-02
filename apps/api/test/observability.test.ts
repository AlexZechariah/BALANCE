import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiMetrics, safeMetricLabel, safeRouteTemplate } from '../src/observability/metrics';
import { ObservabilityModule } from '../src/observability/observability.module';

@Controller('safe')
class SafeRouteController {
  @Get(':id')
  getSafeRoute(@Param('id') id: string) {
    return { ok: Boolean(id) };
  }
}

describe('API observability', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityModule],
      controllers: [SafeRouteController]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    apiMetrics.resetForTests();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('sanitizes route and label values before metrics use', () => {
    expect(safeRouteTemplate('/documents/7f6b7ea7-0f7b-4d79-b312-2f73506e37d3?token=secret')).toBe('/documents/:id');
    expect(safeRouteTemplate('/claims/123456789')).toBe('/claims/:id');
    expect(safeMetricLabel('AUTH_INVALID_TOKEN')).toBe('auth_invalid_token');
    expect(safeMetricLabel('RATE LIMITED!')).toBe('rate_limited');
  });

  it('serves Prometheus metrics without raw request identifiers or query secrets', async () => {
    await request(app.getHttpServer()).get('/safe/7f6b7ea7-0f7b-4d79-b312-2f73506e37d3?token=private-token').expect(200);

    const response = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('balance_api_http_requests_total');
    expect(response.text).toContain('route="/safe/:id"');
    expect(response.text).not.toContain('7f6b7ea7-0f7b-4d79-b312-2f73506e37d3');
    expect(response.text).not.toContain('private-token');
  });

  it('records safe auth, upload, queue, storage, and readiness metric families', async () => {
    apiMetrics.recordAuthFailure('AUTH_REQUIRED');
    apiMetrics.recordRateLimit('upload');
    apiMetrics.recordUploadRejected(new Error('unsupported private filename receipt-123.pdf'));
    await apiMetrics.observeQueue('enqueue', async () => undefined);
    await apiMetrics.observeStorage('put', 'filesystem', async () => undefined);
    await apiMetrics.observeReadiness('postgres', async () => undefined);

    const metrics = await apiMetrics.render();

    expect(metrics).toContain('balance_api_auth_failures_total{reason="auth_required"');
    expect(metrics).toContain('balance_api_rate_limits_total{policy="upload"');
    expect(metrics).toContain('balance_api_uploads_total{outcome="rejected",reason="unknown",content_type="unknown"');
    expect(metrics).toContain('balance_api_queue_operations_total{operation="enqueue",outcome="ok",reason="ok"');
    expect(metrics).toContain('balance_api_storage_operations_total{operation="put",provider="filesystem",outcome="ok",reason="ok"');
    expect(metrics).toContain('balance_api_readiness_checks_total{dependency="postgres",outcome="ok"');
    expect(metrics).not.toContain('receipt-123.pdf');
  });
});
