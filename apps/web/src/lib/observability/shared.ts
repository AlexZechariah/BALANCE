const SENSITIVE_SEGMENT_PATTERN = /(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{4,})/i;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_LABEL_PATTERN = /^[a-z0-9_.:-]{1,64}$/;

export type ClientTelemetryType = 'api_request' | 'navigation' | 'web_vital';
export type TelemetryOutcome = 'ok' | 'error';

export function envFlag(value: string | undefined, fallback = false): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

export function safeMetricLabel(value: string | undefined | null, fallback = 'unknown'): string {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized && SAFE_LABEL_PATTERN.test(normalized) ? normalized : fallback;
}

export function safeRouteTemplate(value: string | undefined | null): string {
  const path = (value ?? '').split(/[?#]/, 1)[0]?.replace(/\/+/g, '/').replace(/\/$/, '') || '';
  if (!path || path === '/') return '/';

  const parts = path.split('/').map((segment) => {
    if (!segment) return '';
    if (segment.startsWith(':') || /^\[[A-Za-z0-9_.-]+\]$/.test(segment)) return ':id';
    if (SENSITIVE_SEGMENT_PATTERN.test(segment)) return ':id';
    return SAFE_SEGMENT_PATTERN.test(segment) ? segment : ':segment';
  });

  return parts.join('/') || '/';
}

export function statusClass(statusCode: number | undefined | null): string {
  if (typeof statusCode === 'number' && statusCode >= 100 && statusCode <= 599) {
    return `${Math.floor(statusCode / 100)}xx`;
  }
  return 'unknown';
}

export function safeDurationSeconds(valueMs: number | undefined | null): number {
  if (typeof valueMs !== 'number' || !Number.isFinite(valueMs) || valueMs < 0) return 0;
  return Math.min(valueMs / 1000, 60);
}

export function safeMetricValue(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 60_000);
}
