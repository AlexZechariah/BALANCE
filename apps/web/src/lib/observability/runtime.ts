import { createRequire } from 'node:module';

import { registerOTel } from '@vercel/otel';

import { envFlag } from './shared';

const SERVICE_NAME = 'balance-web';
const DEFAULT_PYROSCOPE_URL = 'http://pyroscope:4040';
const runtimeRequire = createRequire(import.meta.url);

let started = false;

async function startPyroscope(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || !envFlag(process.env.WEB_PROFILING_ENABLED, false)) {
    return;
  }

  if (process.platform === 'win32') {
    console.warn('Web profiling disabled on Windows host runtime; use the Linux container profile for Pyroscope.');
    return;
  }

  try {
    runtimeRequire.resolve('@pyroscope/nodejs');
    const Pyroscope = (await import('@pyroscope/nodejs')).default;
    Pyroscope.init({
      appName: SERVICE_NAME,
      serverAddress: process.env.PYROSCOPE_SERVER_ADDRESS?.trim() || DEFAULT_PYROSCOPE_URL,
      tags: {
        service: SERVICE_NAME,
      },
      wall: {
        collectCpuTime: true,
      },
    });
    Pyroscope.start();
    process.once('SIGTERM', () => {
      void Pyroscope.stop().catch(() => undefined);
    });
  } catch (error) {
    console.warn(`Web profiling disabled after startup failure: ${error instanceof Error ? error.name : 'unknown'}`);
  }
}

export function startWebObservabilityRuntime(): void {
  if (started || process.env.NODE_ENV === 'test') return;
  started = true;

  if (envFlag(process.env.WEB_OTEL_ENABLED, false)) {
    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME?.trim() || SERVICE_NAME,
    });
  }

  void startPyroscope();
}
