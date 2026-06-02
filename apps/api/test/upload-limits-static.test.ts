import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DOCUMENT_UPLOAD_LIMITS } from '../src/documents/upload-limits';

describe('upload and API body limit wiring', () => {
  it('uses the shared document upload file-size limit in the multipart interceptor', () => {
    const source = readFileSync('src/documents/documents.controller.ts', 'utf8');

    expect(DOCUMENT_UPLOAD_LIMITS.maxFileBytes).toBe(10 * 1024 * 1024);
    expect(source).toContain('fileSize: DOCUMENT_UPLOAD_LIMITS.maxFileBytes');
    expect(source).not.toContain('fileSize: 10 * 1024 * 1024');
  });

  it('configures explicit JSON and URL-encoded parser limits in API bootstrap', () => {
    const source = readFileSync('src/main.ts', 'utf8');

    expect(source).toContain('bodyParser: false');
    expect(source).toContain("app.useBodyParser('json', { limit: config.apiJsonBodyLimit })");
    expect(source).toContain("app.useBodyParser('urlencoded', { limit: config.apiUrlencodedBodyLimit, extended: true })");
  });
});
