export const SESSION_COOKIE_NAME = 'balance.sid';
export const CSRF_COOKIE_NAME = 'balance.csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export const MUTATING_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
