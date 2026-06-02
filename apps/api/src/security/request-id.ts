import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

function normalizeRequestId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;

  const trimmed = candidate.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function getRequestId(request: Request): string | undefined {
  const attached = (request as Request & { requestId?: string }).requestId;
  return attached ?? normalizeRequestId(request.headers[REQUEST_ID_HEADER]) ?? undefined;
}

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction) {
  const requestId = normalizeRequestId(request.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  (request as Request & { requestId: string }).requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
