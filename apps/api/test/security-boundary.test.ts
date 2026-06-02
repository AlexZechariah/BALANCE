import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestContext, createTestContext, type TestContext } from './helpers/backend-app';

describe('API browser/security boundary', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;
  const originalApiCorsOrigins = process.env.API_CORS_ORIGINS;

  let ctx: TestContext;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';
    delete process.env.API_CORS_ORIGINS;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await closeTestContext(ctx);
    if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalCorsOrigins;
    if (originalApiCorsOrigins === undefined) delete process.env.API_CORS_ORIGINS;
    else process.env.API_CORS_ORIGINS = originalApiCorsOrigins;
  });

  it('sets Helmet headers, request IDs, and strict credentialed CORS for allowed origins', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cross-origin-resource-policy']).toBeDefined();
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('keeps disallowed origins out of credentialed CORS responses', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('includes request IDs in contract errors without leaking internals', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/auth/me')
      .set('x-request-id', 'req-test-123')
      .expect(401);

    expect(response.headers['x-request-id']).toBe('req-test-123');
    expect(response.body.error.requestId).toBe('req-test-123');
    expect(JSON.stringify(response.body)).not.toMatch(/stack|SELECT|DATABASE_URL|REDIS_URL|documents\//i);
  });
});
