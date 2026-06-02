import type { Request, Response } from 'express';

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

import { makeContractErrorBody } from './contract-errors';
import { appLogger } from '../logging/logger.service';
import { requestRouteTemplate } from '../observability/metrics';
import { getRequestId } from '../security/request-id';

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'AUTH_REQUIRED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'UPLOAD_TOO_LARGE';
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

function defaultMessageForCode(code: string): string {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 'Request validation failed';
    case 'AUTH_REQUIRED':
      return 'Authentication required';
    case 'AUTH_INVALID_TOKEN':
      return 'Invalid or expired token';
    case 'AUTH_INVALID_CREDENTIALS':
      return 'Invalid credentials';
    case 'FORBIDDEN':
      return 'Forbidden';
    case 'NOT_FOUND':
      return 'Not found';
    case 'CONFLICT':
      return 'Conflict';
    case 'UPLOAD_TOO_LARGE':
      return 'Upload too large';
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Unsupported media type';
    case 'SERVICE_UNAVAILABLE':
      return 'Service unavailable';
    case 'RATE_LIMITED':
      return 'Rate limit exceeded';
    case 'INTERNAL_ERROR':
      return 'Internal server error';
    default:
      return 'Request failed';
  }
}

const INTERNAL_DETAIL_PATTERN = /(stack|select\s+|insert\s+|update\s+|delete\s+|database_url|redis_url|postgresql:\/\/|redis:\/\/|documents\/|storagekey|storage key|password hash|session token)/i;

function sanitizeClientMessage(message: unknown, fallback: string): string {
  if (typeof message !== 'string' || !message.trim()) return fallback;
  return INTERNAL_DETAIL_PATTERN.test(message) ? fallback : message;
}

function sanitizeDetails(details: unknown): Array<{ path: string; message: string }> {
  if (!Array.isArray(details)) return [];

  return details.flatMap((detail) => {
    if (!detail || typeof detail !== 'object') return [];
    const candidate = detail as Record<string, unknown>;
    const path = typeof candidate.path === 'string' ? candidate.path : '';
    const message = sanitizeClientMessage(candidate.message, 'Request validation failed');
    return [{ path, message }];
  });
}

function contractBodyFromExceptionResponse(value: unknown, status: number, requestId: string | undefined) {
  if (!value || typeof value !== 'object' || !('error' in value)) return null;

  const source = value as { error?: Record<string, unknown> };
  if (!source.error || typeof source.error !== 'object') return null;

  const code = typeof source.error.code === 'string' ? source.error.code : defaultCodeForStatus(status);
  const fallback = defaultMessageForCode(code);
  const message = sanitizeClientMessage(source.error.message, fallback);
  const details = sanitizeDetails(source.error.details);
  return makeContractErrorBody(code, message, details, requestId);
}

@Catch()
export class ContractHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId(request);

    // Multer errors (file upload) are not HttpExceptions by default.
    // Map them into contract-stable error envelopes.
    if (typeof exception === 'object' && exception) {
      const maybe = exception as Record<string, unknown>;
      const maybeCode = typeof maybe.code === 'string' ? maybe.code : undefined;
      const maybeName = typeof maybe.name === 'string' ? maybe.name : undefined;

      if (maybeName === 'MulterError' && maybeCode === 'LIMIT_FILE_SIZE') {
        response.status(HttpStatus.PAYLOAD_TOO_LARGE).json(makeContractErrorBody('UPLOAD_TOO_LARGE', 'Upload too large', [], requestId));
        return;
      }

      if (maybeName === 'MulterError') {
        response.status(HttpStatus.UNPROCESSABLE_ENTITY).json(makeContractErrorBody('VALIDATION_ERROR', 'Request validation failed', [], requestId));
        return;
      }
    }

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttp) {
      appLogger.error({
        requestId,
        req: {
          method: request.method,
          route: requestRouteTemplate(request)
        },
        err: {
          name: exception instanceof Error ? exception.name : typeof exception
        }
      }, 'Unhandled request exception');
    }

    if (isHttp) {
      const exResponse = exception.getResponse();
      const body = contractBodyFromExceptionResponse(exResponse, status, requestId);
      if (body) {
        response.status(status).json(body);
        return;
      }
    }

    const code = defaultCodeForStatus(status);
    const message = defaultMessageForCode(code);

    const body = makeContractErrorBody(code, message, [], requestId);

    response.status(status).json(body);
  }
}
