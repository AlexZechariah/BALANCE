export type ObjectStorageProviderName = 'filesystem' | 's3Compatible';

export type ObjectReference = {
  provider: ObjectStorageProviderName;
  key: string;
  bucket?: string | null;
  root?: string | null;
  originalFilename?: string | null | undefined;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  etag?: string | null;
};

export type ObjectStoragePutInput = {
  key: string;
  body: Buffer;
  contentType: string;
  originalFilename?: string | null | undefined;
};

export type ObjectStorageGetResult = {
  body: Buffer;
  contentType: string | null;
  sizeBytes: number;
  sha256: string;
};

export type ObjectStorageStatResult = Omit<ObjectReference, 'originalFilename'>;

export interface ObjectStorageProvider {
  readonly provider: ObjectStorageProviderName;
  putObject(input: ObjectStoragePutInput): Promise<ObjectReference>;
  getObject(key: string): Promise<ObjectStorageGetResult>;
  statObject(key: string): Promise<ObjectStorageStatResult>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
}
