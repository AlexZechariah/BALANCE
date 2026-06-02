import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import type { StorageDriverAdapter, StoragePutObjectInput } from './storage.types';

export class S3StorageAdapter implements StorageDriverAdapter {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    region: string
  ) {
    this.client = new S3Client({ region });
  }

  async putObject(input: StoragePutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType
      })
    );
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string | null }> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );

    const stream = result.Body;
    if (!(stream instanceof Readable)) {
      throw new Error('Unexpected S3 response body');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      body: Buffer.concat(chunks),
      contentType: result.ContentType ?? null
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    // DeleteObjectCommand is idempotent — returns 204 even if object doesn't exist
  }
}
