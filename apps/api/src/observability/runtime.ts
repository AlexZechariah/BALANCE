import Pyroscope from '@pyroscope/nodejs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const SERVICE_NAME = 'balance-api';
const DEFAULT_OTLP_BASE_URL = 'http://alloy:4318';
const DEFAULT_PYROSCOPE_URL = 'http://pyroscope:4040';

function runtimeWarn(message: string, metadata: Record<string, string> = {}): void {
  process.stderr.write(`${JSON.stringify({ level: 'warn', service: SERVICE_NAME, message, ...metadata })}\n`);
}

function envFlag(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  return fallback;
}

function otlpEndpoint(kind: 'traces' | 'logs'): string {
  const specific = process.env[`OTEL_EXPORTER_OTLP_${kind.toUpperCase()}_ENDPOINT`]?.trim();
  if (specific) return specific;
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || DEFAULT_OTLP_BASE_URL;
  return `${base.replace(/\/+$/, '')}/v1/${kind}`;
}

function startOpenTelemetry(): NodeSDK | null {
  if (process.env.NODE_ENV === 'test' || !envFlag('API_OTEL_ENABLED')) {
    return null;
  }

  const sdk = new NodeSDK({
    serviceName: SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({ url: otlpEndpoint('traces') }),
    logRecordProcessors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ url: otlpEndpoint('logs') }))
    ],
    instrumentations: [
      new HttpInstrumentation({
        disableIncomingRequestInstrumentation: true,
        redactedQueryParams: [
          'access_token',
          'authorization',
          'code',
          'csrf',
          'password',
          'session',
          'sig',
          'signature',
          'token',
          'x-amz-signature',
          'x-goog-signature'
        ]
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new PrismaInstrumentation(),
      new PinoInstrumentation({
        logKeys: {
          traceId: 'traceId',
          spanId: 'spanId',
          traceFlags: 'traceFlags'
        }
      })
    ]
  });

  sdk.start();
  process.once('SIGTERM', () => {
    void sdk.shutdown().catch(() => undefined);
  });
  return sdk;
}

function startPyroscope(): void {
  if (process.env.NODE_ENV === 'test' || !envFlag('API_PROFILING_ENABLED')) {
    return;
  }

  if (process.platform === 'win32') {
    runtimeWarn('API profiling disabled on Windows host runtime; use the Linux container profile for Pyroscope.', {
      reason: 'windows_host'
    });
    return;
  }

  try {
    Pyroscope.init({
      appName: SERVICE_NAME,
      serverAddress: process.env.PYROSCOPE_SERVER_ADDRESS?.trim() || DEFAULT_PYROSCOPE_URL,
      tags: {
        service: SERVICE_NAME
      },
      wall: {
        collectCpuTime: true
      }
    });
    Pyroscope.start();
    process.once('SIGTERM', () => {
      void Pyroscope.stop().catch(() => undefined);
    });
  } catch (error) {
    runtimeWarn('API profiling disabled after startup failure.', {
      errorName: error instanceof Error ? error.name : 'unknown'
    });
  }
}

startOpenTelemetry();
startPyroscope();
