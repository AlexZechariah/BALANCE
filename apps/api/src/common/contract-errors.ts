import { HttpException, HttpStatus } from '@nestjs/common';

export type ContractErrorDetail = {
  path: string;
  message: string;
};

export type ContractErrorBody = {
  error: {
    code: string;
    message: string;
    details: ContractErrorDetail[];
    requestId?: string;
  };
};

export function makeContractErrorBody(
  code: string,
  message: string,
  details: ContractErrorDetail[] = [],
  requestId?: string
): ContractErrorBody {
  const error: ContractErrorBody['error'] = { code, message, details };
  if (requestId) error.requestId = requestId;
  return { error };
}

export function throwContractHttpError(
  status: number,
  code: string,
  message: string,
  details: ContractErrorDetail[] = []
): never {
  throw new HttpException(makeContractErrorBody(code, message, details), status);
}

export function throwValidationError(details: ContractErrorDetail[], status: number = HttpStatus.UNPROCESSABLE_ENTITY): never {
  throwContractHttpError(status, 'VALIDATION_ERROR', 'Request validation failed', details);
}
