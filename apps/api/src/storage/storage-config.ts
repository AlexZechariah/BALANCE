import type { ObjectStorageProviderName } from './object-storage.types';

export type StorageRuntimeConfig = {
  provider: ObjectStorageProviderName;
  filesystemRoot: string;
  s3CompatibleEndpoint: string;
  s3CompatibleBucket: string;
};

export function loadStorageRuntimeConfig(env: NodeJS.ProcessEnv = process.env): StorageRuntimeConfig {
  const provider = parseProvider(env.OBJECT_STORAGE_PROVIDER || env.STORAGE_DRIVER);

  return {
    provider,
    filesystemRoot: (env.OBJECT_STORAGE_FILESYSTEM_ROOT || env.STORAGE_FILESYSTEM_ROOT || '/data/balance-storage').trim(),
    s3CompatibleEndpoint: (env.OBJECT_STORAGE_ENDPOINT || '').trim(),
    s3CompatibleBucket: (env.OBJECT_STORAGE_BUCKET || env.S3_BUCKET || '').trim()
  };
}

function parseProvider(value: string | undefined): ObjectStorageProviderName {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 's3compatible' || normalized === 's3_compatible') {
    return 's3Compatible';
  }
  return 'filesystem';
}
