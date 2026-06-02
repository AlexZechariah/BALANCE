import { createHash, randomBytes } from 'node:crypto';

export function createOpaqueAuthToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function expiresIn(milliseconds: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + milliseconds);
}
