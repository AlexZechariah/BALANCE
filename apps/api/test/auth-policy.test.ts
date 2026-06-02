import type { Response } from 'express';

import { describe, expect, it, vi } from 'vitest';

import { AuthController } from '../src/auth/auth.controller';

const SAFE_STAGING_ENV = {
  APP_ENV: 'staging',
  AUTH_SELF_REGISTRATION_ENABLED: 'false',
  COOKIE_SECURE: 'true',
  TRUST_PROXY: 'loopback',
  CORS_ORIGINS: 'https://app.balance.example',
  EXTERNAL_WEB_ORIGIN: 'https://app.balance.example',
  DATABASE_URL: 'postgresql://balance:strong-secret@db.internal:5432/balance?schema=public',
  REDIS_URL: 'redis://default:strong-secret@redis.internal:6379'
} as const;

describe('authentication exposure policy', () => {
  it('blocks non-local self-registration before invoking account lookup or creation', async () => {
    const original = new Map(Object.keys(SAFE_STAGING_ENV).map((key) => [key, process.env[key]]));
    Object.assign(process.env, SAFE_STAGING_ENV);
    const auth = { register: vi.fn() };
    try {
      const controller = new AuthController(
        auth as never,
        {} as never,
        {} as never,
        {} as never
      );
      await expect(controller.register({
        email: 'existing@example.test',
        password: 'valid staging passphrase 1',
        displayName: 'Staging User'
      }, {} as Response)).rejects.toMatchObject({
        status: 403,
        response: {
          error: {
            code: 'AUTH_REGISTRATION_UNAVAILABLE',
            message: 'Registration is unavailable'
          }
        }
      });
      expect(auth.register).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of original) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
