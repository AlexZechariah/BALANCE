import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isInternalMetricsRequest, normalizeClientTelemetryEvent, handleClientTelemetryRequest, webMetrics } from './server';
import { safeRouteTemplate } from './shared';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  webMetrics.resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('web observability privacy helpers', () => {
  it('sanitizes raw API paths before metrics or logs use', () => {
    expect(safeRouteTemplate('/documents/7f6b7ea7-0f7b-4d79-b312-2f73506e37d3/preview?token=secret')).toBe('/documents/:id/preview');
    expect(safeRouteTemplate('/enterprise/members/123456789/password')).toBe('/enterprise/members/:id/password');
    expect(safeRouteTemplate('/claims/[id]')).toBe('/claims/:id');
  });

  it('normalizes client API events without preserving raw IDs or query strings', () => {
    const event = normalizeClientTelemetryEvent({
      type: 'api_request',
      method: 'PATCH',
      route: '/reviews/7f6b7ea7-0f7b-4d79-b312-2f73506e37d3/approve?token=private',
      statusClass: '2xx',
      outcome: 'ok',
      durationSeconds: 0.123,
    });

    const serialized = JSON.stringify(event);

    expect(event).toMatchObject({
      event: 'balance.web.api_request',
      method: 'PATCH',
      route: '/reviews/:id/approve',
      status_class: '2xx',
      outcome: 'ok',
    });
    expect(serialized).not.toContain('7f6b7ea7-0f7b-4d79-b312-2f73506e37d3');
    expect(serialized).not.toContain('private');
  });

  it('allows internal metrics only for configured internal hosts', () => {
    process.env.WEB_INTERNAL_METRICS_ENABLED = 'true';
    process.env.WEB_INTERNAL_METRICS_HOSTS = 'web:3000';

    expect(isInternalMetricsRequest(new Request('http://web:3000/internal/metrics', {
      headers: { host: 'web:3000' },
    }))).toBe(true);
    expect(isInternalMetricsRequest(new Request('http://localhost:3000/internal/metrics', {
      headers: { host: 'localhost:3000' },
    }))).toBe(false);
  });

  it('logs and counts only sanitized client telemetry fields', async () => {
    process.env.WEB_CLIENT_TELEMETRY_ENABLED = 'true';
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await handleClientTelemetryRequest(new Request('http://web:3000/observability/client-events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'web_vital',
        id: 'do-not-log',
        name: 'LCP',
        rating: 'good',
        navigationType: 'navigate',
        value: 1250,
        entries: [{ name: 'private-dom-entry' }],
      }),
    }));

    const metrics = await webMetrics.render();
    const logged = info.mock.calls.map((call) => call.join(' ')).join('\n');

    expect(response.status).toBe(204);
    expect(metrics).toContain('balance_web_vitals_total{name="lcp",rating="good",navigation_type="navigate"');
    expect(logged).toContain('balance.web_vital');
    expect(logged).not.toContain('do-not-log');
    expect(logged).not.toContain('private-dom-entry');
  });
});
