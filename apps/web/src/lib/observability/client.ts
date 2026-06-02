import type { ClientTelemetryType, TelemetryOutcome } from './shared';
import { envFlag, safeMetricValue, safeRouteTemplate, safeDurationSeconds, safeMetricLabel, statusClass } from './shared';

const CLIENT_EVENT_PATH = '/observability/client-events';

interface ClientTelemetryPayload {
  type: ClientTelemetryType;
  method?: string;
  route?: string;
  statusClass?: string;
  outcome?: TelemetryOutcome;
  durationSeconds?: number;
  name?: string;
  rating?: string;
  navigationType?: string;
  value?: number;
}

function telemetryEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_WEB_CLIENT_TELEMETRY_ENABLED, false);
}

function sendClientTelemetry(payload: ClientTelemetryPayload): void {
  if (!telemetryEnabled() || typeof window === 'undefined') return;

  const body = JSON.stringify(payload);
  if (body.length > 2048) return;

  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon?.(CLIENT_EVENT_PATH, blob)) {
      return;
    }
  } catch {
    return;
  }

  void fetch(CLIENT_EVENT_PATH, {
    method: 'POST',
    body,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  }).catch(() => undefined);
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function markClientRequestStart(): number {
  return nowMs();
}

export function recordApiClientRequest(input: {
  method: string;
  path: string;
  statusCode: number | null;
  startedAtMs: number;
  outcome: TelemetryOutcome;
}): void {
  sendClientTelemetry({
    type: 'api_request',
    method: safeMetricLabel(input.method, 'GET').toUpperCase(),
    route: safeRouteTemplate(input.path),
    statusClass: statusClass(input.statusCode),
    outcome: input.outcome,
    durationSeconds: safeDurationSeconds(nowMs() - input.startedAtMs),
  });
}

export function recordNavigation(url: string, navigationType: string): void {
  sendClientTelemetry({
    type: 'navigation',
    route: safeRouteTemplate(url),
    navigationType: safeMetricLabel(navigationType, 'unknown'),
  });
}

export function recordWebVital(metric: {
  name: string;
  rating?: string;
  navigationType?: string;
  value?: number;
  delta?: number;
}): void {
  sendClientTelemetry({
    type: 'web_vital',
    name: safeMetricLabel(metric.name),
    rating: safeMetricLabel(metric.rating, 'unknown'),
    navigationType: safeMetricLabel(metric.navigationType, 'unknown'),
    value: safeMetricValue(metric.value),
  });
}
