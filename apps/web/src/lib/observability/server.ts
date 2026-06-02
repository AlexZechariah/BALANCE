import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import { envFlag, safeDurationSeconds, safeMetricLabel, safeMetricValue, safeRouteTemplate, statusClass } from './shared';

const SERVICE_NAME = 'balance-web';
const DEFAULT_INTERNAL_METRICS_HOSTS = ['web:3000'];
const MAX_CLIENT_EVENT_BYTES = 4096;

type NormalizedClientTelemetryEvent =
  | {
      event: 'balance.web.api_request';
      service: typeof SERVICE_NAME;
      method: string;
      route: string;
      status_class: string;
      outcome: 'ok' | 'error';
      duration_seconds: number;
    }
  | {
      event: 'balance.web.navigation';
      service: typeof SERVICE_NAME;
      route: string;
      navigation_type: string;
    }
  | {
      event: 'balance.web_vital';
      service: typeof SERVICE_NAME;
      name: string;
      rating: string;
      navigation_type: string;
      value: number;
    };

function parseHosts(value: string | undefined): string[] {
  const hosts = (value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : DEFAULT_INTERNAL_METRICS_HOSTS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeOutcome(value: unknown): 'ok' | 'error' {
  return value === 'ok' ? 'ok' : 'error';
}

function safeMethod(value: unknown): string {
  return safeMetricLabel(typeof value === 'string' ? value : undefined, 'GET').toUpperCase();
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

class WebMetrics {
  private readonly registry = new Registry();
  private readonly info = new Gauge({
    name: 'balance_web_info',
    help: 'Static Balance web service metadata.',
    registers: [this.registry],
  });
  private readonly clientEvents = new Counter({
    name: 'balance_web_client_events_total',
    help: 'Accepted browser telemetry events by type.',
    labelNames: ['kind'],
    registers: [this.registry],
  });
  private readonly apiRequests = new Counter({
    name: 'balance_web_api_client_requests_total',
    help: 'Browser API client request outcomes by safe method, route template, status class, and outcome.',
    labelNames: ['method', 'route', 'status_class', 'outcome'],
    registers: [this.registry],
  });
  private readonly apiDuration = new Histogram({
    name: 'balance_web_api_client_request_duration_seconds',
    help: 'Browser API client request duration by safe method, route template, and outcome.',
    labelNames: ['method', 'route', 'outcome'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    registers: [this.registry],
  });
  private readonly webVitals = new Counter({
    name: 'balance_web_vitals_total',
    help: 'Browser Web Vitals reports by safe metric name, rating, and navigation type.',
    labelNames: ['name', 'rating', 'navigation_type'],
    registers: [this.registry],
  });
  private readonly webVitalValues = new Histogram({
    name: 'balance_web_vital_value',
    help: 'Browser Web Vitals reported values by safe metric name and rating.',
    labelNames: ['name', 'rating'],
    buckets: [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [this.registry],
  });
  private readonly navigations = new Counter({
    name: 'balance_web_navigation_events_total',
    help: 'Browser navigation starts by safe route template and navigation type.',
    labelNames: ['route', 'navigation_type'],
    registers: [this.registry],
  });
  private readonly serverErrors = new Counter({
    name: 'balance_web_server_errors_total',
    help: 'Next.js server request errors by safe method, route template, route type, and error class.',
    labelNames: ['method', 'route', 'route_type', 'error_class'],
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: SERVICE_NAME });
    collectDefaultMetrics({
      prefix: 'balance_web_',
      register: this.registry,
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

  recordClientEvent(event: NormalizedClientTelemetryEvent): void {
    if (event.event === 'balance.web.api_request') {
      const labels = {
        method: event.method,
        route: event.route,
        status_class: event.status_class,
        outcome: event.outcome,
      };
      this.clientEvents.inc({ kind: 'api_request' });
      this.apiRequests.inc(labels);
      this.apiDuration.observe({ method: event.method, route: event.route, outcome: event.outcome }, event.duration_seconds);
      return;
    }

    if (event.event === 'balance.web_vital') {
      const labels = {
        name: event.name,
        rating: event.rating,
        navigation_type: event.navigation_type,
      };
      this.clientEvents.inc({ kind: 'web_vital' });
      this.webVitals.inc(labels);
      this.webVitalValues.observe({ name: event.name, rating: event.rating }, event.value);
      return;
    }

    this.clientEvents.inc({ kind: 'navigation' });
    this.navigations.inc({
      route: event.route,
      navigation_type: event.navigation_type,
    });
  }

  recordServerError(input: { method: string; route: string; routeType: string; errorClass: string }): void {
    this.serverErrors.inc({
      method: input.method,
      route: input.route,
      route_type: input.routeType,
      error_class: input.errorClass,
    });
  }
}

declare global {
  var __balanceWebMetrics: WebMetrics | undefined;
}

export const webMetrics = globalThis.__balanceWebMetrics ?? new WebMetrics();
globalThis.__balanceWebMetrics = webMetrics;

export function normalizeClientTelemetryEvent(input: unknown): NormalizedClientTelemetryEvent | null {
  if (!isRecord(input)) return null;

  if (input.type === 'api_request') {
    return {
      event: 'balance.web.api_request',
      service: SERVICE_NAME,
      method: safeMethod(input.method),
      route: safeRouteTemplate(safeString(input.route)),
      status_class: safeMetricLabel(safeString(input.statusClass), statusClass(safeNumber(input.statusCode))),
      outcome: safeOutcome(input.outcome),
      duration_seconds: safeDurationSeconds(safeNumber(input.durationSeconds) ? safeNumber(input.durationSeconds)! * 1000 : undefined),
    };
  }

  if (input.type === 'web_vital') {
    return {
      event: 'balance.web_vital',
      service: SERVICE_NAME,
      name: safeMetricLabel(safeString(input.name)),
      rating: safeMetricLabel(safeString(input.rating), 'unknown'),
      navigation_type: safeMetricLabel(safeString(input.navigationType), 'unknown'),
      value: safeMetricValue(safeNumber(input.value)),
    };
  }

  if (input.type === 'navigation') {
    return {
      event: 'balance.web.navigation',
      service: SERVICE_NAME,
      route: safeRouteTemplate(safeString(input.route)),
      navigation_type: safeMetricLabel(safeString(input.navigationType), 'unknown'),
    };
  }

  return null;
}

export function isInternalMetricsRequest(request: Request): boolean {
  if (!envFlag(process.env.WEB_INTERNAL_METRICS_ENABLED, false)) return false;
  const allowedHosts = parseHosts(process.env.WEB_INTERNAL_METRICS_HOSTS);
  const host = request.headers.get('host')?.trim().toLowerCase();
  return Boolean(host && allowedHosts.includes(host));
}

export async function handleClientTelemetryRequest(request: Request): Promise<Response> {
  if (!envFlag(process.env.WEB_CLIENT_TELEMETRY_ENABLED, false)) {
    return new Response(null, { status: 204 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_CLIENT_EVENT_BYTES) {
    return new Response(null, { status: 204 });
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return new Response(null, { status: 204 });
  }

  try {
    const event = normalizeClientTelemetryEvent(await request.json());
    if (event) {
      webMetrics.recordClientEvent(event);
      console.info(JSON.stringify(event));
    }
  } catch {
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}

export function recordNextRequestError(input: {
  error: unknown;
  request: { path?: string; method?: string };
  context: { routePath?: string; routeType?: string };
}): void {
  const method = safeMethod(input.request.method);
  const route = safeRouteTemplate(input.context.routePath || input.request.path);
  const routeType = safeMetricLabel(input.context.routeType, 'unknown');
  const errorName = input.error instanceof Error ? input.error.name : 'unknown';
  const digest = isRecord(input.error) && typeof input.error.digest === 'string' ? input.error.digest : null;
  const errorClass = safeMetricLabel(errorName, 'error');
  webMetrics.recordServerError({ method, route, routeType, errorClass });
  console.error(JSON.stringify({
    event: 'balance.web.request_error',
    service: SERVICE_NAME,
    method,
    route,
    route_type: routeType,
    error_class: errorClass,
    digest_present: Boolean(digest),
  }));
}
