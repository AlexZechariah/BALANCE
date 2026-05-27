import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemObjectStorageProvider } from '../src/storage/providers/filesystem.provider';

describe('FilesystemObjectStorageProvider', () => {
  it('stores, reads, stats, and rejects path traversal object keys', async () => {
    const rootDir = path.resolve(process.cwd(), '..', '..', 'tmp', 'storage-contract', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(rootDir, { recursive: true });

    const provider = new FilesystemObjectStorageProvider(rootDir);
    const put = await provider.putObject({
      key: 'documents/doc-1/original.pdf',
      body: Buffer.from('%PDF-1.4\n% Balance contract test\n'),
      contentType: 'application/pdf'
    });

    expect(put).toMatchObject({
      provider: 'filesystem',
      key: 'documents/doc-1/original.pdf',
      contentType: 'application/pdf',
      sizeBytes: expect.any(Number),
      sha256: expect.any(String)
    });

    await expect(provider.exists('documents/doc-1/original.pdf')).resolves.toBe(true);

    const stat = await provider.statObject('documents/doc-1/original.pdf');
    expect(stat).toMatchObject({
      provider: 'filesystem',
      key: 'documents/doc-1/original.pdf',
      sizeBytes: put.sizeBytes,
      sha256: put.sha256
    });

    const read = await provider.getObject('documents/doc-1/original.pdf');
    expect(read.body.toString('utf8')).toContain('Balance contract test');
    expect(read.contentType).toBe('application/pdf');

    await expect(
      provider.putObject({
        key: '../escape.pdf',
        body: Buffer.from('no'),
        contentType: 'application/pdf'
      })
    ).rejects.toThrow('Invalid object key');
  });
});
