import type { DestinationStream, Logger } from 'pino';
import pino from 'pino';

export const REDACTED_VALUE = '[redacted]';

export const LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.Authorization',
  'req.headers.cookie',
  'req.headers.Cookie',
  'res.headers["set-cookie"]',
  'res.headers["Set-Cookie"]',
  'password',
  '*.password',
  'req.body.password',
  'currentPassword',
  'newPassword',
  'token',
  '*.token',
  'sessionToken',
  'csrfToken',
  'resetToken',
  'verificationToken',
  'authorization',
  'cookie',
  'setCookie',
  'databaseUrl',
  'redisUrl',
  'storageSecret',
  'originalFilename',
  '*.originalFilename',
  'req.body.originalFilename',
  'storageKey',
  'storagePath',
  'storageBucket',
  'artifactPath',
  'objectRef',
  'rawOcrText',
  'ocrText',
  'extractionPayload',
  'queuePayload',
  'req.body.rawOcrText',
  'req.body.ocrText',
  'req.body.extractionPayload',
  'req.body.queuePayload',
  'req.body.objectRef',
  'req.body.storagePath'
] as const;

const SENSITIVE_KEY_PATTERN = /(password|token|secret|cookie|authorization|databaseurl|redisurl|originalfilename|storagekey|storagepath|storagebucket|artifactpath|objectref|rawocrtext|ocrtext|extractionpayload|queuepayload|betterauth|awsaccesskey|awssecret)/i;

export type BalanceLogger = Logger;

export function createBalanceLogger(destination?: DestinationStream): BalanceLogger {
  const defaultLevel = process.env.NODE_ENV === 'test' && !destination ? 'silent' : 'info';
  return pino(
    {
      level: process.env.LOG_LEVEL || defaultLevel,
      redact: {
        paths: [...LOG_REDACTION_PATHS],
        censor: REDACTED_VALUE
      }
    },
    destination
  );
}

export function redactLogPayload<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : redactValue(entry);
  }
  return redacted;
}

export const appLogger = createBalanceLogger();
