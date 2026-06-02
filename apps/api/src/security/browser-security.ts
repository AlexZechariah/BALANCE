import type { INestApplication } from '@nestjs/common';
import type { AppConfig } from '@balance/types';
import helmet from 'helmet';

import { TRACE_ID_HEADER } from '../observability/observability.interceptor';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './request-id';

const ALLOWED_HEADERS = [
  'authorization',
  'content-type',
  'x-csrf-token',
  REQUEST_ID_HEADER
];

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

export function configureApiSecurity(app: INestApplication, config: AppConfig): void {
  const allowedOrigins = new Set(config.corsOrigins);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    exposedHeaders: [REQUEST_ID_HEADER, TRACE_ID_HEADER],
    origin(origin: string | undefined, callback: (error: Error | null, origin?: string | boolean) => void) {
      if (!origin) {
        callback(null, false);
        return;
      }

      callback(null, allowedOrigins.has(origin) ? origin : false);
    }
  });
}
