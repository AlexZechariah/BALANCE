import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWebObservabilityRuntime } = await import('./lib/observability/runtime');
    startWebObservabilityRuntime();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recordNextRequestError } = await import('./lib/observability/server');
    recordNextRequestError({ error, request, context });
  }
};
