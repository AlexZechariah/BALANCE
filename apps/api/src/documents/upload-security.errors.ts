import { HttpStatus } from '@nestjs/common';

import { throwContractHttpError } from '../common/contract-errors';

export function throwUnsupportedUpload(path: string, message: string): never {
  throwContractHttpError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', [
    { path, message }
  ]);
}

export function throwUploadTooLarge(path: string, message: string): never {
  throwContractHttpError(HttpStatus.PAYLOAD_TOO_LARGE, 'UPLOAD_TOO_LARGE', 'Upload too large', [
    { path, message }
  ]);
}
