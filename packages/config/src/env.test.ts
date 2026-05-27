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
      appVersion: '0.5.0',
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
      storageDriver: 'filesystem',
      s3Bucket: '',
      s3Region: '',
      gitCommit: 'abc1234',
      buildId: 'build-42'
    });
  });

  it('throws when a configured port is invalid', () => {
    expect(() => loadAppConfig({ API_PORT: '70000' })).toThrow('must be a valid TCP port');
  });
});
