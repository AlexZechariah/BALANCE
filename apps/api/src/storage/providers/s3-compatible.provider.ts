import type {
  ObjectReference,
  ObjectStorageGetResult,
  ObjectStorageProvider,
  ObjectStoragePutInput,
  ObjectStorageStatResult
} from '../object-storage.types';

export class S3CompatibleObjectStorageProvider implements ObjectStorageProvider {
  readonly provider = 's3Compatible' as const;

  constructor(private readonly endpoint: string, private readonly bucket: string) {}

  putObject(_input: ObjectStoragePutInput): Promise<ObjectReference> {
    return this.disabled();
  }

  getObject(_key: string): Promise<ObjectStorageGetResult> {
    return this.disabled();
  }

  statObject(_key: string): Promise<ObjectStorageStatResult> {
    return this.disabled();
  }

  exists(_key: string): Promise<boolean> {
    return this.disabled();
  }

  deleteObject(_key: string): Promise<void> {
    return this.disabled();
  }

  private disabled(): never {
    throw new Error(
      `s3Compatible storage is configured but not active in v0.5 (endpoint=${this.endpoint}, bucket=${this.bucket})`
    );
  }
}
