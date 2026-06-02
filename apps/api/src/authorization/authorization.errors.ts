import { throwContractHttpError } from '../common/contract-errors';

export function throwForbidden(): never {
  throwContractHttpError(403, 'FORBIDDEN', 'Forbidden', []);
}

export function throwMaskedNotFound(): never {
  throwContractHttpError(404, 'NOT_FOUND', 'Not found', []);
}
