import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Request } from 'express';

const SERVICE_NAME = 'balance-api';
const SENSITIVE_SEGMENT_PATTERN = /(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{4,})/i;
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_LABEL_PATTERN = /^[a-z0-9_.:-]{1,64}$/;

export type MetricOutcome = 'ok' | 'error';

export function safeMetricLabel(value: string | undefined | null, fallback = 'unknown'): string {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized && SAFE_LABEL_PATTERN.test(normalized) ? normalized : fallback;
}

export function statusClass(statusCode: number): string {
  if (statusCode >= 100 && statusCode <= 599) {
    return `${Math.floor(statusCode / 100)}xx`;
  }
  return 'unknown';
}

export function safeRouteTemplate(value: string | undefined | null): string {
  const path = (value ?? '').split(/[?#]/, 1)[0]?.replace(/\/+/g, '/').replace(/\/$/, '') || '';
  if (!path || path === '/') return '/';

  const parts = path.split('/').map((segment) => {
    if (!segment) return '';
    if (segment.startsWith(':')) return segment;
    if (SENSITIVE_SEGMENT_PATTERN.test(segment)) return ':id';
    return SAFE_SEGMENT_PATTERN.test(segment) ? segment : ':segment';
  });

  return parts.join('/') || '/';
}

export function requestRouteTemplate(request: Request): string {
  const route = request.route as { path?: string | RegExp } | undefined;
  const routePath = typeof route?.path === 'string' ? route.path : undefined;
  const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
  if (routePath) {
    const separator = routePath.startsWith('/') || !baseUrl ? '' : '/';
    return safeRouteTemplate(`${baseUrl}${separator}${routePath}`);
  }
  return 'unmatched';
}

function contractCodeFromError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown';
  const response = typeof (error as { getResponse?: unknown }).getResponse === 'function'
    ? (error as { getResponse: () => unknown }).getResponse()
    : null;
  if (!response || typeof response !== 'object' || !('error' in response)) return 'unknown';
  const candidate = (response as { error?: { code?: unknown } }).error?.code;
  return typeof candidate === 'string' ? safeMetricLabel(candidate) : 'unknown';
}

class ApiMetrics {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter({
    name: 'balance_api_http_requests_total',
    help: 'Total API HTTP requests by method, route template, and status class.',
    labelNames: ['method', 'route', 'status_class'],
    registers: [this.registry]
  });
  private readonly httpDuration = new Histogram({
    name: 'balance_api_http_request_duration_seconds',
    help: 'API HTTP request duration by method, route template, and status class.',
    labelNames: ['method', 'route', 'status_class'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry]
  });
  private readonly authFailures = new Counter({
    name: 'balance_api_auth_failures_total',
    help: 'Authentication or CSRF failures by safe reason code.',
    labelNames: ['reason'],
    registers: [this.registry]
  });
  private readonly rateLimits = new Counter({
    name: 'balance_api_rate_limits_total',
    help: 'Rate-limit denials by configured policy.',
    labelNames: ['policy'],
    registers: [this.registry]
  });
  private readonly uploads = new Counter({
    name: 'balance_api_uploads_total',
    help: 'Upload validation outcomes by sanitized reason and content type.',
    labelNames: ['outcome', 'reason', 'content_type'],
    registers: [this.registry]
  });
  private readonly queueOperations = new Counter({
    name: 'balance_api_queue_operations_total',
    help: 'Queue operation outcomes by operation and sanitized reason.',
    labelNames: ['operation', 'outcome', 'reason'],
    registers: [this.registry]
  });
  private readonly queueDuration = new Histogram({
    name: 'balance_api_queue_operation_duration_seconds',
    help: 'Queue operation duration by operation and outcome.',
    labelNames: ['operation', 'outcome'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry]
  });
  private readonly storageOperations = new Counter({
    name: 'balance_api_storage_operations_total',
    help: 'Storage operation outcomes by operation, provider, and sanitized reason.',
    labelNames: ['operation', 'provider', 'outcome', 'reason'],
    registers: [this.registry]
  });
  private readonly storageDuration = new Histogram({
    name: 'balance_api_storage_operation_duration_seconds',
    help: 'Storage operation duration by operation, provider, and outcome.',
    labelNames: ['operation', 'provider', 'outcome'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry]
  });
  private readonly readinessChecks = new Counter({
    name: 'balance_api_readiness_checks_total',
    help: 'Readiness dependency checks by dependency and outcome.',
    labelNames: ['dependency', 'outcome'],
    registers: [this.registry]
  });
  private readonly readinessDuration = new Histogram({
    name: 'balance_api_readiness_check_duration_seconds',
    help: 'Readiness dependency check duration by dependency and outcome.',
    labelNames: ['dependency', 'outcome'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry]
  });
  private readonly info = new Gauge({
    name: 'balance_api_info',
    help: 'Static Balance API service metadata.',
    registers: [this.registry]
  });

  constructor() {
    this.registry.setDefaultLabels({ service: SERVICE_NAME });
    collectDefaultMetrics({
      prefix: 'balance_api_',
      register: this.registry
    });
    this.info.set(1);
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  resetForTests(): void {
    this.registry.resetMetrics();
    this.info.set(1);
  }

  recordHttpRequest(input: { method: string; route: string; statusCode: number; durationSeconds: number }): void {
    if (input.route === '/metrics') return;
    const labels = {
      method: safeMetricLabel(input.method, 'unknown').toUpperCase(),
      route: safeRouteTemplate(input.route),
      status_class: statusClass(input.statusCode)
    };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, input.durationSeconds);
  }

  recordAuthFailure(reason: string): void {
    this.authFailures.inc({ reason: safeMetricLabel(reason) });
  }

  recordRateLimit(policy: string | undefined): void {
    this.rateLimits.inc({ policy: safeMetricLabel(policy, 'default') });
  }

  recordUploadAccepted(contentType: string): void {
    this.uploads.inc({
      outcome: 'accepted',
      reason: 'accepted',
      content_type: safeMetricLabel(contentType.replace('/', '_'), 'unknown')
    });
  }

  recordUploadRejected(error: unknown): void {
    this.uploads.inc({
      outcome: 'rejected',
      reason: contractCodeFromError(error),
      content_type: 'unknown'
    });
  }

  async observeQueue<T>(operation: string, action: () => Promise<T>): Promise<T> {
    const end = this.queueDuration.startTimer({ operation: safeMetricLabel(operation) });
    try {
      const result = await action();
      this.queueOperations.inc({ operation: safeMetricLabel(operation), outcome: 'ok', reason: 'ok' });
      end({ outcome: 'ok' });
      return result;
    } catch (error) {
      this.queueOperations.inc({ operation: safeMetricLabel(operation), outcome: 'error', reason: contractCodeFromError(error) });
      end({ outcome: 'error' });
      throw error;
    }
  }

  async observeStorage<T>(operation: string, provider: string, action: () => Promise<T>): Promise<T> {
    const labels = {
      operation: safeMetricLabel(operation),
      provider: safeMetricLabel(provider)
    };
    const end = this.storageDuration.startTimer(labels);
    try {
      const result = await action();
      this.storageOperations.inc({ ...labels, outcome: 'ok', reason: 'ok' });
      end({ outcome: 'ok' });
      return result;
    } catch (error) {
      this.storageOperations.inc({ ...labels, outcome: 'error', reason: contractCodeFromError(error) });
      end({ outcome: 'error' });
      throw error;
    }
  }

  async observeReadiness<T>(dependency: string, action: () => Promise<T>): Promise<T> {
    const labels = { dependency: safeMetricLabel(dependency) };
    const end = this.readinessDuration.startTimer(labels);
    try {
      const result = await action();
      this.readinessChecks.inc({ ...labels, outcome: 'ok' });
      end({ outcome: 'ok' });
      return result;
    } catch (error) {
      this.readinessChecks.inc({ ...labels, outcome: 'error' });
      end({ outcome: 'error' });
      throw error;
    }
  }
}

export const apiMetrics = new ApiMetrics();
