#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const controllers = [
  'apps/api/src/audit/audit.controller.ts',
  'apps/api/src/auth/auth.controller.ts',
  'apps/api/src/budgets/budgets.controller.ts',
  'apps/api/src/claims/claims.controller.ts',
  'apps/api/src/documents/documents.controller.ts',
  'apps/api/src/enterprise/enterprise.controller.ts',
  'apps/api/src/reviews/reviews.controller.ts'
];

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const publicAuthRoutes = new Set([
  'POST /auth/login',
  'POST /auth/register',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/confirm',
  'POST /auth/email-verification/request',
  'POST /auth/email-verification/confirm'
]);
const authOnlyRoutes = new Set([
  'GET /auth/me',
  'GET /auth/sessions',
  'PATCH /auth/me',
  'POST /auth/logout',
  'POST /auth/sessions/revoke-others'
]);
const verifiedEmailRoutes = new Set([
  'POST /claims',
  'POST /enterprise/members',
  'DELETE /enterprise/members/:id',
  'PATCH /enterprise/members/:id',
  'PATCH /enterprise/members/:id/password',
  'PATCH /enterprise/members/:id/role',
  'POST /reviews/:id/claim',
  'POST /reviews/:id/assign',
  'DELETE /reviews/:id/assign',
  'POST /reviews/:id/approve',
  'POST /reviews/:id/reject'
]);
const expectedRateLimits = new Map([
  ['GET /audit/summary', 'metrics'],
  ['GET /budgets', 'list'],
  ['GET /claims', 'list'],
  ['GET /claims/:id', 'read'],
  ['GET /claims/insights', 'insights'],
  ['GET /documents', 'list'],
  ['GET /documents/:id', 'read'],
  ['GET /documents/:id/duplicates', 'list'],
  ['GET /documents/:id/timeline', 'read'],
  ['GET /documents/insights', 'insights'],
  ['GET /enterprise/claims', 'list'],
  ['GET /enterprise/documents', 'list'],
  ['GET /enterprise/documents/:id', 'read'],
  ['GET /enterprise/members', 'list'],
  ['GET /reviews/:id', 'read'],
  ['GET /reviews/metrics', 'metrics'],
  ['GET /reviews/queue', 'list']
]);
const forbiddenMirrorTests = new Map([
  ['GET /documents/:id', 'authorization-forbidden: foreign document detail'],
  ['GET /documents/:id/preview', 'authorization-forbidden: foreign document preview'],
  ['GET /claims/:id', 'authorization-forbidden: foreign claim detail'],
  ['GET /reviews/:id', 'authorization-forbidden: foreign review detail'],
  ['GET /budgets', 'authorization-forbidden: foreign budget scope'],
  ['GET /audit', 'authorization-forbidden: filtered audit visibility'],
  ['GET /enterprise/members', 'authorization-forbidden: membership tenant scope']
]);

function cleanPath(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

function routePath(controllerPath, methodPath) {
  const joined = [controllerPath, methodPath].map(cleanPath).filter(Boolean).join('/');
  return `/${joined}`;
}

function firstStringArg(source) {
  const match = source.match(/\(\s*['"`]([^'"`]*)['"`]/);
  return match?.[1] ?? '';
}

function parseController(file) {
  const absolute = path.join(repoRoot, file);
  const lines = readFileSync(absolute, 'utf8').split(/\r?\n/);
  const rows = [];
  let controllerPath = '';
  let decorators = [];
  let className = path.basename(file, '.ts');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@Controller(')) {
      controllerPath = firstStringArg(trimmed);
      decorators = [];
      continue;
    }

    const classMatch = trimmed.match(/^export\s+class\s+(\w+)/);
    if (classMatch) {
      className = classMatch[1];
      decorators = [];
      continue;
    }

    if (trimmed.startsWith('@')) {
      decorators.push(trimmed);
      continue;
    }

    const methodMatch = trimmed.match(/^async\s+(\w+)\s*\(/);
    if (!methodMatch) continue;

    const routeDecorator = decorators.find((decorator) => /^@(Get|Post|Put|Patch|Delete)\(/.test(decorator));
    if (!routeDecorator) {
      decorators = [];
      continue;
    }

    const httpMethod = routeDecorator.match(/^@(\w+)\(/)?.[1]?.toUpperCase() ?? 'UNKNOWN';
    const route = `${httpMethod} ${routePath(controllerPath, firstStringArg(routeDecorator))}`;
    const rateMatch = decorators.join(' ').match(/@BalanceRateLimit\(\s*['"`]([^'"`]+)['"`]\s*\)/);

    rows.push({
      file,
      className,
      handler: methodMatch[1],
      route,
      httpMethod,
      rateLimit: rateMatch?.[1] ?? 'none',
      authGuard: decorators.some((decorator) => decorator.includes('@UseGuards(') && decorator.includes('AuthGuard')),
      roles: decorators.some((decorator) => decorator.startsWith('@Roles(')),
      policies: decorators.some((decorator) => decorator.startsWith('@CheckPolicies(')),
      verifiedEmail: decorators.some((decorator) => decorator.startsWith('@RequireVerifiedEmail(')),
      csrfExpected: mutatingMethods.has(httpMethod) && decorators.some((decorator) => decorator.includes('@UseGuards(') && decorator.includes('AuthGuard')),
      forbiddenMirror: forbiddenMirrorTests.get(route) ?? ''
    });

    decorators = [];
  }

  return rows;
}

const rows = controllers.flatMap(parseController).sort((left, right) => left.route.localeCompare(right.route));
const errors = [];

for (const row of rows) {
  if (mutatingMethods.has(row.httpMethod) && row.rateLimit === 'none') {
    errors.push(`${row.route} (${row.className}.${row.handler}) is mutable and missing @BalanceRateLimit`);
  }

  const expectedRateLimit = expectedRateLimits.get(row.route);
  if (expectedRateLimit && row.rateLimit !== expectedRateLimit) {
    errors.push(`${row.route} (${row.className}.${row.handler}) expected @BalanceRateLimit('${expectedRateLimit}') but found '${row.rateLimit}'`);
  }

  if (!publicAuthRoutes.has(row.route) && !row.authGuard) {
    errors.push(`${row.route} (${row.className}.${row.handler}) is missing AuthGuard`);
  }

  if (!publicAuthRoutes.has(row.route) && !authOnlyRoutes.has(row.route) && !row.roles) {
    errors.push(`${row.route} (${row.className}.${row.handler}) is missing @Roles`);
  }

  if (!publicAuthRoutes.has(row.route) && !authOnlyRoutes.has(row.route) && !row.policies) {
    errors.push(`${row.route} (${row.className}.${row.handler}) is missing @CheckPolicies`);
  }

  if (verifiedEmailRoutes.has(row.route) && !row.verifiedEmail) {
    errors.push(`${row.route} (${row.className}.${row.handler}) is missing @RequireVerifiedEmail`);
  }
}

console.log('route,file,controller,handler,rateLimit,authGuard,roles,policies,verifiedEmail,csrfExpected,forbiddenMirror');
for (const row of rows) {
  console.log(`${row.route},${row.file},${row.className},${row.handler},${row.rateLimit},${row.authGuard},${row.roles},${row.policies},${row.verifiedEmail},${row.csrfExpected},${row.forbiddenMirror}`);
}

if (errors.length > 0) {
  console.error('\nRoute inventory failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}
