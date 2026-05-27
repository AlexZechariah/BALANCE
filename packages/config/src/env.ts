import type { AppConfig } from '@balance/types';
import { buildApiBaseUrl, normalizeEnvironment, parsePort } from '@balance/utils';
import { appVersion as defaultAppVersion } from './env.defaults.json';

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function normalizePath(value: string | undefined, fallback: string): string {
  const source = value?.trim() || fallback;
  const withLeadingSlash = source.startsWith('/') ? source : `/${source}`;

  if (withLeadingSlash === '/') {
    return withLeadingSlash;
  }

  return withLeadingSlash.replace(/\/+$/, '');
}

function normalizeUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

function parseStorageDriver(value: string | undefined): 'filesystem' | 's3' | 's3Compatible' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 's3compatible' || normalized === 's3_compatible') {
    return 's3Compatible';
  }
  if (normalized === 's3' || normalized === 'legacy_s3') {
    return 's3';
  }
  return 'filesystem';
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiPort = parsePort(env.API_PORT, 3001);
  const webPort = parsePort(env.WEB_PORT, 3000);
  const publicHttpPort = parsePort(env.PUBLIC_HTTP_PORT, webPort);
  const apiBaseUrl = buildApiBaseUrl(env.API_BASE_URL, apiPort);
  const apiProxyTarget = buildApiBaseUrl(env.API_PROXY_TARGET, apiPort);
  const appName = firstNonEmpty(env.PRODUCT_NAME, env.APP_NAME) || 'Balance';
  const appEnv = normalizeEnvironment(firstNonEmpty(env.APP_ENV, env.NODE_ENV));
  const storageDriver = parseStorageDriver(firstNonEmpty(env.STORAGE_DRIVER, env.OBJECT_STORAGE_PROVIDER));
  const s3Bucket = firstNonEmpty(env.S3_BUCKET, env.OBJECT_STORAGE_BUCKET) || '';
  const s3Region = firstNonEmpty(env.S3_REGION, env.OBJECT_STORAGE_REGION) || '';
  const apiBasePath = normalizePath(firstNonEmpty(env.API_BASE_PATH, env.NEXT_PUBLIC_API_BASE_PATH), '/api');
  const apiHealthPath = normalizePath(
    firstNonEmpty(env.API_HEALTH_PATH, env.NEXT_PUBLIC_API_HEALTH_PATH),
    `${apiBasePath}/health`
  );
  const apiVersionPath = normalizePath(
    firstNonEmpty(env.API_VERSION_PATH, env.NEXT_PUBLIC_API_VERSION_PATH),
    `${apiBasePath}/version`
  );

  return {
    appName,
    appEnv,
    projectSlug: firstNonEmpty(env.PROJECT_SLUG) || 'balance',
    deploymentNamespace: firstNonEmpty(env.DEPLOYMENT_NAMESPACE) || 'balance',
    appVersion: env.APP_VERSION?.trim() || defaultAppVersion,
    gitCommit: env.GIT_COMMIT?.trim() || 'local',
    buildId: env.BUILD_ID?.trim() || 'local-build',
    webPort,
    publicHttpPort,
    apiPort,
    apiBaseUrl,
    apiProxyTarget,
    desktopApiBaseUrl: normalizeUrl(env.DESKTOP_API_BASE_URL, `http://localhost:${webPort}${apiBasePath}`),
    apiBasePath,
    apiHealthPath,
    apiVersionPath,

    databaseUrl: firstNonEmpty(env.DATABASE_URL) || 'postgresql://balance:balance@postgres:5432/balance?schema=public',
    redisUrl: firstNonEmpty(env.REDIS_URL) || 'redis://redis:6379',

    storageDriver,
    storageFilesystemRoot: firstNonEmpty(env.STORAGE_FILESYSTEM_ROOT) || '/data/balance-storage',
    s3Bucket,
    s3Region,

    jwtSecret: firstNonEmpty(env.JWT_SECRET) || '',
    jwtExpiresIn: firstNonEmpty(env.JWT_EXPIRES_IN) || '1h',
    passwordPepper: firstNonEmpty(env.PASSWORD_PEPPER) || ''
  };
}
