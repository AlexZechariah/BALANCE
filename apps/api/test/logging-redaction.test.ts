import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  LOG_REDACTION_PATHS,
  createBalanceLogger,
  redactLogPayload
} from '../src/logging/logger.service';

function captureStream() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString('utf8'));
      callback();
    }
  });

  return {
    stream,
    lines: () => chunks.join('').trim().split(/\r?\n/).filter(Boolean)
  };
}

describe('structured logging redaction', () => {
  it('defines central redaction paths for credentials, cookies, tokens, OCR text, and extraction payloads', () => {
    expect(LOG_REDACTION_PATHS).toEqual(expect.arrayContaining([
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'sessionToken',
      'csrfToken',
      'databaseUrl',
      'redisUrl',
      'originalFilename',
      'storagePath',
      'artifactPath',
      'objectRef',
      'rawOcrText',
      'extractionPayload',
      'queuePayload'
    ]));
  });

  it('redacts sensitive values before ad hoc security metadata is persisted or logged', () => {
    const payload = redactLogPayload({
      password: 'valid local passphrase 1',
      sessionToken: 'session-secret',
      csrfToken: 'csrf-secret',
      databaseUrl: 'postgresql://balance:balance@localhost:5432/balance',
      redisUrl: 'redis://localhost:6379',
      originalFilename: 'private-receipt.pdf',
      storagePath: '/data/balance-storage/private/file.pdf',
      artifactPath: '/data/balance-storage/artifacts/document/job.json',
      rawOcrText: 'PRIVATE OCR TEXT',
      ocrText: 'PRIVATE OCR TEXT 2',
      extractionPayload: { text: 'FULL EXTRACTION PAYLOAD' },
      queuePayload: { objectRef: { key: 'documents/private-key.pdf' } },
      nested: {
        authorization: 'Bearer secret',
        cookie: 'balance.sid=secret',
        objectRef: { key: 'documents/private-key.pdf' }
      }
    });

    expect(JSON.stringify(payload)).not.toContain('valid local passphrase 1');
    expect(JSON.stringify(payload)).not.toContain('session-secret');
    expect(JSON.stringify(payload)).not.toContain('PRIVATE OCR TEXT');
    expect(JSON.stringify(payload)).not.toContain('/data/balance-storage');
    expect(JSON.stringify(payload)).not.toContain('private-receipt.pdf');
    expect(JSON.stringify(payload)).not.toContain('documents/private-key.pdf');
    expect(payload).toMatchObject({
      password: '[redacted]',
      sessionToken: '[redacted]',
      originalFilename: '[redacted]',
      storagePath: '[redacted]',
      artifactPath: '[redacted]',
      rawOcrText: '[redacted]',
      ocrText: '[redacted]',
      extractionPayload: '[redacted]',
      queuePayload: '[redacted]',
      nested: {
        authorization: '[redacted]',
        cookie: '[redacted]',
        objectRef: '[redacted]'
      }
    });
  });

  it('preserves bounded authentication cleanup counts', () => {
    expect(redactLogPayload({
      expiredSessionsRevoked: 2,
      expiredOrConsumedRecordsDeleted: 3,
      accountRecordRetentionDays: 7
    })).toEqual({
      expiredSessionsRevoked: 2,
      expiredOrConsumedRecordsDeleted: 3,
      accountRecordRetentionDays: 7
    });
  });

  it('writes structured Pino logs with request IDs and redacted request data', () => {
    const capture = captureStream();
    const logger = createBalanceLogger(capture.stream);

    logger.info({
      requestId: 'req-log-123',
      req: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'balance.sid=session-secret'
        },
        body: {
          password: 'valid local passphrase 1',
          originalFilename: 'private-receipt.pdf',
          rawOcrText: 'PRIVATE OCR TEXT',
          storagePath: '/data/balance-storage/private/file.pdf',
          queuePayload: { objectRef: { key: 'documents/private-key.pdf' } }
        }
      },
      sessionToken: 'session-secret'
    }, 'security event');

    const line = capture.lines().at(-1);
    expect(line).toBeTruthy();
    const parsed = JSON.parse(line!);

    expect(parsed.requestId).toBe('req-log-123');
    expect(JSON.stringify(parsed)).not.toContain('Bearer secret');
    expect(JSON.stringify(parsed)).not.toContain('session-secret');
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE OCR TEXT');
    expect(JSON.stringify(parsed)).not.toContain('/data/balance-storage');
    expect(JSON.stringify(parsed)).not.toContain('private-receipt.pdf');
    expect(JSON.stringify(parsed)).not.toContain('documents/private-key.pdf');
    expect(parsed.req.headers.authorization).toBe('[redacted]');
    expect(parsed.req.headers.cookie).toBe('[redacted]');
    expect(parsed.req.body.password).toBe('[redacted]');
    expect(parsed.req.body.originalFilename).toBe('[redacted]');
    expect(parsed.req.body.rawOcrText).toBe('[redacted]');
    expect(parsed.req.body.storagePath).toBe('[redacted]');
    expect(parsed.req.body.queuePayload).toBe('[redacted]');
  });

  it('keeps runtime logging call sites from printing storage keys or raw console errors', () => {
    const sourceFiles = [
      'src/app.controller.ts',
      'src/common/contract-http-exception.filter.ts',
      'src/storage/object-storage.service.ts',
      'src/observability/runtime.ts'
    ];
    const combinedSource = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(combinedSource).not.toContain('console.error');
    expect(combinedSource).not.toContain('console.warn');
    expect(combinedSource).not.toContain('originalUrl');
    expect(combinedSource).not.toMatch(/key=\$\{/);
  });
});
