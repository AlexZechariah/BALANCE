export type StorageDriver = 'filesystem' | 's3';

export type StoragePutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type StorageGetObjectResult = {
  body: Buffer;
  contentType: string | null;
};

export interface StorageDriverAdapter {
  putObject(input: StoragePutObjectInput): Promise<void>;
  getObject(key: string): Promise<StorageGetObjectResult>;
  deleteObject(key: string): Promise<void>;
}
