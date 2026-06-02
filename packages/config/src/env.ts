import { isIP } from 'node:net';

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

function normalizeBodyLimit(value: string | undefined, fallback: string): string {
  const normalized = (value?.trim() || fallback).toLowerCase();
  const match = normalized.match(/^(\d+)(b|kb|mb)?$/);
  if (!match || Number(match[1]) <= 0) {
    throw new Error(`Body limit must be a positive byte, kb, or mb value: ${normalized}`);
  }
  return normalized;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Boolean value must be true or false: ${value}`);
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseStorageDriver(value: string | undefined): 'filesystem' | 's3Compatible' {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'filesystem') return 'filesystem';
  if (normalized === 's3compatible' || normalized === 's3_compatible') {
    return 's3Compatible';
  }
  throw new Error(`Unsupported storage driver: ${value}`);
}

function parseTrustProxy(value: string | undefined): false | string[] {
  const normalized = value?.trim();
  if (!normalized || ['0', 'false', 'no', 'off'].includes(normalized.toLowerCase())) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase())) {
    throw new Error('TRUST_PROXY must be false or an explicit comma-separated proxy allowlist');
  }
  const entries = parseCsv(normalized);
  const invalidEntry = entries.find((entry) => {
    if (entry === 'loopback' || isIP(entry) > 0) return false;
    const separator = entry.lastIndexOf('/');
    if (separator <= 0) return true;
    const address = entry.slice(0, separator);
    const prefix = entry.slice(separator + 1);
    const family = isIP(address);
    const maxPrefix = family === 4 ? 32 : family === 6 ? 128 : -1;
    return !/^\d+$/.test(prefix) || Number(prefix) > maxPrefix;
  });
  if (entries.length === 0 || invalidEntry) {
    throw new Error('TRUST_PROXY entries must be loopback, IP addresses, or CIDR ranges');
  }
  return entries;
}

function isLocalOnlyHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.startsWith('127.') ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '::' ||
    normalized === '[::]'
  );
}

function requireNonLocalUrl(
  name: string,
  value: string | undefined,
  options: { rejectLocalhost?: boolean; requireHttps?: boolean; requirePassword?: boolean } = {}
): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required in staging and production`);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (options.requireHttps && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https in staging and production`);
  }
  if (
    options.rejectLocalhost &&
    isLocalOnlyHostname(parsed.hostname)
  ) {
    throw new Error(`${name} must not use a localhost-only origin in staging and production`);
  }
  if (options.requirePassword && !parsed.password) {
    throw new Error(`${name} must include a non-placeholder password in staging and production`);
  }
  const lower = normalized.toLowerCase();
  if (lower.includes('replace-this') || lower.includes('change-me') || lower.includes('balance:balance@')) {
    throw new Error(`${name} must not use placeholder credentials in staging and production`);
  }
  return normalized;
}

function resolveAppEnvironment(env: NodeJS.ProcessEnv): AppConfig['appEnv'] {
  const explicitAppEnv = firstNonEmpty(env.APP_ENV);
  if (explicitAppEnv) {
    return normalizeEnvironment(explicitAppEnv);
  }

  const nodeEnv = firstNonEmpty(env.NODE_ENV)?.toLowerCase();
  if (!nodeEnv || nodeEnv === 'development' || nodeEnv === 'test') {
    return 'local';
  }

  return normalizeEnvironment(nodeEnv);
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiPort = parsePort(env.API_PORT, 3001);
  const webPort = parsePort(env.WEB_PORT, 3000);
  const publicHttpPort = parsePort(env.PUBLIC_HTTP_PORT, webPort);
  const apiBaseUrl = buildApiBaseUrl(env.API_BASE_URL, apiPort);
  const apiProxyTarget = buildApiBaseUrl(env.API_PROXY_TARGET, apiPort);
  const appName = firstNonEmpty(env.PRODUCT_NAME, env.APP_NAME) || 'Balance';
  const appEnv = resolveAppEnvironment(env);
  const isDeploymentEnvironment = appEnv === 'staging' || appEnv === 'production';
  const authDevExposeAccountTokens = parseBoolean(env.AUTH_DEV_EXPOSE_ACCOUNT_TOKENS, false);
  if (isDeploymentEnvironment && authDevExposeAccountTokens) {
    throw new Error('AUTH_DEV_EXPOSE_ACCOUNT_TOKENS must be false in staging and production');
  }
  const authSelfRegistrationEnabled = parseBoolean(env.AUTH_SELF_REGISTRATION_ENABLED, appEnv === 'local');
  if (appEnv === 'production' && authSelfRegistrationEnabled) {
    throw new Error('AUTH_SELF_REGISTRATION_ENABLED must be false in production');
  }
  const authAccountTokenRetentionDays = parsePositiveInteger(env.AUTH_ACCOUNT_TOKEN_RETENTION_DAYS, 7, 'AUTH_ACCOUNT_TOKEN_RETENTION_DAYS');
  const secureCookies = parseBoolean(env.COOKIE_SECURE, isDeploymentEnvironment);
  if (isDeploymentEnvironment && !secureCookies) {
    throw new Error('COOKIE_SECURE must be true in staging and production');
  }
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (isDeploymentEnvironment && trustProxy === false) {
    throw new Error('TRUST_PROXY must contain an explicit proxy allowlist in staging and production');
  }
  const storageDriver = parseStorageDriver(firstNonEmpty(env.STORAGE_DRIVER, env.OBJECT_STORAGE_PROVIDER));
  const s3CompatibleBucket = firstNonEmpty(env.OBJECT_STORAGE_BUCKET) || '';
  const s3CompatibleEndpoint = firstNonEmpty(env.OBJECT_STORAGE_ENDPOINT) || '';
  const apiBasePath = normalizePath(firstNonEmpty(env.API_BASE_PATH, env.NEXT_PUBLIC_API_BASE_PATH), '/api');
  const apiHealthPath = normalizePath(
    firstNonEmpty(env.API_HEALTH_PATH, env.NEXT_PUBLIC_API_HEALTH_PATH),
    `${apiBasePath}/health`
  );
  const apiVersionPath = normalizePath(
    firstNonEmpty(env.API_VERSION_PATH, env.NEXT_PUBLIC_API_VERSION_PATH),
    `${apiBasePath}/version`
  );
  const configuredCorsOrigins = parseCsv(firstNonEmpty(env.API_CORS_ORIGINS, env.CORS_ORIGINS));
  if (isDeploymentEnvironment && configuredCorsOrigins.length === 0) {
    throw new Error('API_CORS_ORIGINS or CORS_ORIGINS is required in staging and production');
  }
  const corsOrigins =
    configuredCorsOrigins.length > 0
      ? configuredCorsOrigins
      : [
          `http://localhost:${publicHttpPort}`,
          `http://127.0.0.1:${publicHttpPort}`,
          `http://localhost:${webPort}`,
          `http://127.0.0.1:${webPort}`
        ].filter((origin, index, values) => values.indexOf(origin) === index);
  if (
    isDeploymentEnvironment &&
    corsOrigins.some((origin) => {
      const url = new URL(origin);
      return url.protocol !== 'https:' || isLocalOnlyHostname(url.hostname);
    })
  ) {
    throw new Error('CORS origins must use non-local https URLs in staging and production');
  }

  const externalWebOrigin = isDeploymentEnvironment
    ? normalizeUrl(
        requireNonLocalUrl('EXTERNAL_WEB_ORIGIN', env.EXTERNAL_WEB_ORIGIN, {
          requireHttps: true,
          rejectLocalhost: true
        }),
        ''
      )
    : normalizeUrl(env.EXTERNAL_WEB_ORIGIN, `http://localhost:${webPort}`);
  const databaseUrl = isDeploymentEnvironment
    ? requireNonLocalUrl('DATABASE_URL', env.DATABASE_URL, {
        requirePassword: true
      })
    : firstNonEmpty(env.DATABASE_URL) || 'postgresql://balance:balance@postgres:5432/balance?schema=public';
  const redisUrl = isDeploymentEnvironment
    ? requireNonLocalUrl('REDIS_URL', env.REDIS_URL, { requirePassword: true })
    : firstNonEmpty(env.REDIS_URL) || 'redis://redis:6379';

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
    apiJsonBodyLimit: normalizeBodyLimit(env.API_JSON_BODY_LIMIT, '1mb'),
    apiUrlencodedBodyLimit: normalizeBodyLimit(env.API_URLENCODED_BODY_LIMIT, '100kb'),
    authDevExposeAccountTokens,
    authSelfRegistrationEnabled,
    authAccountTokenRetentionDays,
    secureCookies,
    trustProxy,
    externalWebOrigin,
    corsOrigins,

    databaseUrl,
    redisUrl,

    storageDriver,
    storageFilesystemRoot: firstNonEmpty(env.STORAGE_FILESYSTEM_ROOT) || '/data/balance-storage',
    s3CompatibleBucket,
    s3CompatibleEndpoint
  };
}
