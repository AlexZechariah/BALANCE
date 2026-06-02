import { describe, expect, it } from 'vitest';

import { loadAppConfig } from './env';

describe('loadAppConfig', () => {
  it('returns defaults when environment values are missing', () => {
    expect(loadAppConfig({})).toMatchObject({
      appName: 'Balance',
      appEnv: 'local',
      projectSlug: 'balance',
      deploymentNamespace: 'balance',
      publicHttpPort: 3000,
      apiBaseUrl: 'http://localhost:3001',
      apiProxyTarget: 'http://localhost:3001',
      apiBasePath: '/api',
      apiHealthPath: '/api/health',
      apiVersionPath: '/api/version',
      apiJsonBodyLimit: '1mb',
      apiUrlencodedBodyLimit: '100kb',
      authDevExposeAccountTokens: false,
      authSelfRegistrationEnabled: true,
      authAccountTokenRetentionDays: 7,
      secureCookies: false,
      trustProxy: false,
      externalWebOrigin: 'http://localhost:3000',
      corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      appVersion: '0.6.0',
      gitCommit: 'local',
      buildId: 'local-build'
    });
  });

  it('normalizes public-safe values and trims trailing slashes', () => {
    expect(
      loadAppConfig({
        PRODUCT_NAME: 'Balance',
        NODE_ENV: 'production',
        PROJECT_SLUG: 'balance',
        DEPLOYMENT_NAMESPACE: 'balance',
        PUBLIC_HTTP_PORT: '8080',
        APP_VERSION: '0.2.0',
        API_BASE_URL: 'https://api.balance.example/',
        API_PROXY_TARGET: 'https://proxy.balance.example/',
        NEXT_PUBLIC_API_BASE_PATH: '/gateway',
        NEXT_PUBLIC_API_HEALTH_PATH: '/gateway/health',
        NEXT_PUBLIC_API_VERSION_PATH: '/gateway/version',
        API_JSON_BODY_LIMIT: '2MB',
        API_URLENCODED_BODY_LIMIT: '256KB',
        CORS_ORIGINS: 'https://app.balance.example, https://desktop.balance.example/',
        EXTERNAL_WEB_ORIGIN: 'https://app.balance.example',
        TRUST_PROXY: 'loopback,10.0.0.0/8',
        DATABASE_URL: 'postgresql://balance:strong-secret@db.internal:5432/balance?schema=public',
        REDIS_URL: 'redis://default:strong-secret@redis.internal:6379',
        GIT_COMMIT: 'abc1234',
        BUILD_ID: 'build-42'
      })
    ).toMatchObject({
      appName: 'Balance',
      appEnv: 'production',
      projectSlug: 'balance',
      deploymentNamespace: 'balance',
      publicHttpPort: 8080,
      appVersion: '0.2.0',
      apiBaseUrl: 'https://api.balance.example',
      apiProxyTarget: 'https://proxy.balance.example',
      apiBasePath: '/gateway',
      apiHealthPath: '/gateway/health',
      apiVersionPath: '/gateway/version',
      apiJsonBodyLimit: '2mb',
      apiUrlencodedBodyLimit: '256kb',
      secureCookies: true,
      trustProxy: ['loopback', '10.0.0.0/8'],
      externalWebOrigin: 'https://app.balance.example',
      authSelfRegistrationEnabled: false,
      corsOrigins: ['https://app.balance.example', 'https://desktop.balance.example'],
      storageDriver: 'filesystem',
      s3CompatibleBucket: '',
      s3CompatibleEndpoint: '',
      gitCommit: 'abc1234',
      buildId: 'build-42'
    });
  });

  it('allows local-only account-token exposure and blocks it in staging', () => {
    expect(
      loadAppConfig({
        APP_ENV: 'local',
        AUTH_DEV_EXPOSE_ACCOUNT_TOKENS: 'true'
      })
    ).toMatchObject({
      authDevExposeAccountTokens: true
    });

    expect(() =>
      loadAppConfig({
        APP_ENV: 'staging',
        AUTH_DEV_EXPOSE_ACCOUNT_TOKENS: 'true'
      })
    ).toThrow('AUTH_DEV_EXPOSE_ACCOUNT_TOKENS must be false in staging and production');
  });

  it('rejects unsupported explicit environment modes', () => {
    expect(() => loadAppConfig({ APP_ENV: 'test' })).toThrow('Unsupported application environment');
  });

  it('maps standard non-production Node environments to local only when APP_ENV is absent', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' })).toMatchObject({ appEnv: 'local' });
    expect(loadAppConfig({ NODE_ENV: 'development' })).toMatchObject({ appEnv: 'local' });
  });

  it('rejects unsupported raw s3 storage and preserves the provider-neutral s3-compatible boundary', () => {
    expect(() => loadAppConfig({ STORAGE_DRIVER: 's3' })).toThrow('Unsupported storage driver');
    expect(
      loadAppConfig({
        STORAGE_DRIVER: 's3Compatible',
        OBJECT_STORAGE_BUCKET: 'local-bucket',
        OBJECT_STORAGE_ENDPOINT: 'http://storage.local'
      })
    ).toMatchObject({
      storageDriver: 's3Compatible',
      s3CompatibleBucket: 'local-bucket',
      s3CompatibleEndpoint: 'http://storage.local'
    });
  });

  it('throws when a configured port is invalid', () => {
    expect(() => loadAppConfig({ API_PORT: '70000' })).toThrow('must be a valid TCP port');
  });

  it('throws when a configured API body limit is invalid', () => {
    expect(() => loadAppConfig({ API_JSON_BODY_LIMIT: '10 elephants' })).toThrow('Body limit must be');
  });

  it('fails closed on unsafe staging and production configuration', () => {
    expect(() => loadAppConfig({ APP_ENV: 'staging' })).toThrow(
      'TRUST_PROXY must contain an explicit proxy allowlist in staging and production'
    );
    expect(() => loadAppConfig({ APP_ENV: 'local', TRUST_PROXY: 'true' })).toThrow(
      'TRUST_PROXY must be false or an explicit comma-separated proxy allowlist'
    );
    expect(() => loadAppConfig({ APP_ENV: 'local', TRUST_PROXY: 'proxy.internal' })).toThrow(
      'TRUST_PROXY entries must be loopback, IP addresses, or CIDR ranges'
    );
    expect(() =>
      loadAppConfig({
        APP_ENV: 'production',
        AUTH_SELF_REGISTRATION_ENABLED: 'true'
      })
    ).toThrow('AUTH_SELF_REGISTRATION_ENABLED must be false in production');
    expect(() =>
      loadAppConfig({
        APP_ENV: 'local',
        AUTH_ACCOUNT_TOKEN_RETENTION_DAYS: '0'
      })
    ).toThrow('AUTH_ACCOUNT_TOKEN_RETENTION_DAYS must be a positive integer');
    expect(() =>
      loadAppConfig({
        APP_ENV: 'staging',
        TRUST_PROXY: 'loopback',
        CORS_ORIGINS: 'https://app.balance.example',
        EXTERNAL_WEB_ORIGIN: 'https://localhost',
        DATABASE_URL: 'postgresql://balance:strong-secret@db.internal:5432/balance?schema=public',
        REDIS_URL: 'redis://default:strong-secret@redis.internal:6379'
      })
    ).toThrow('EXTERNAL_WEB_ORIGIN must not use a localhost-only origin in staging and production');
    expect(() =>
      loadAppConfig({
        APP_ENV: 'staging',
        TRUST_PROXY: 'loopback',
        CORS_ORIGINS: 'https://127.0.0.2',
        EXTERNAL_WEB_ORIGIN: 'https://app.balance.example',
        DATABASE_URL: 'postgresql://balance:strong-secret@db.internal:5432/balance?schema=public',
        REDIS_URL: 'redis://default:strong-secret@redis.internal:6379'
      })
    ).toThrow('CORS origins must use non-local https URLs in staging and production');
  });
});
