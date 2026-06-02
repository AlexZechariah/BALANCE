import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { context as otelContext, isSpanContextValid, trace } from '@opentelemetry/api';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { HttpException, Injectable } from '@nestjs/common';

import { apiMetrics, requestRouteTemplate, safeRouteTemplate } from './metrics';

export const TRACE_ID_HEADER = 'x-trace-id';

const tracer = trace.getTracer('balance-api');

function statusCodeFromError(error: unknown): number {
  return error instanceof HttpException ? error.getStatus() : 500;
}

@Injectable()
export class ApiObservabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    const route = requestRouteTemplate(request);
    const started = process.hrtime.bigint();
    const span = tracer.startSpan(`HTTP ${method} ${safeRouteTemplate(route)}`, {
      attributes: {
        'http.request.method': method,
        'http.route': safeRouteTemplate(route),
        'balance.request_id': (request as Request & { requestId?: string }).requestId ?? 'unknown'
      }
    });
    const spanContext = span.spanContext();
    if (isSpanContextValid(spanContext)) {
      response.setHeader(TRACE_ID_HEADER, spanContext.traceId);
    }

    return otelContext.with(trace.setSpan(otelContext.active(), span), () => next.handle().pipe(
      tap(() => {
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        span.setAttribute('http.response.status_code', response.statusCode);
        apiMetrics.recordHttpRequest({ method, route, statusCode: response.statusCode, durationSeconds });
        span.end();
      }),
      catchError((error: unknown) => {
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        const statusCode = statusCodeFromError(error);
        span.setAttribute('http.response.status_code', statusCode);
        span.recordException(error instanceof Error ? error : new Error('Request failed'));
        apiMetrics.recordHttpRequest({ method, route, statusCode, durationSeconds });
        span.end();
        return throwError(() => error);
      })
    ));
  }
}
