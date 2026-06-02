import { describe, expect, it } from 'vitest';

import {
  buildApiBaseUrl,
  normalizeEnvironment,
  parsePort,
  trimTrailingSlash
} from './runtime';

describe('normalizeEnvironment', () => {
  it('falls back to local when the value is missing', () => {
    expect(normalizeEnvironment(undefined)).toBe('local');
  });

  it('normalizes mixed-case values', () => {
    expect(normalizeEnvironment('StAgInG')).toBe('staging');
  });

  it('rejects unsupported explicit values instead of falling back to local', () => {
    expect(() => normalizeEnvironment('prodction')).toThrow('Unsupported application environment');
  });
});

describe('parsePort', () => {
  it('uses the fallback when the value is empty', () => {
    expect(parsePort(undefined, 3001)).toBe(3001);
  });

  it('parses a valid port string', () => {
    expect(parsePort('4100', 3001)).toBe(4100);
  });

  it('throws for an invalid port', () => {
    expect(() => parsePort('abc', 3001)).toThrow('must be a valid TCP port');
  });
});

describe('URL helpers', () => {
  it('trims a trailing slash', () => {
    expect(trimTrailingSlash('http://localhost:3001/')).toBe('http://localhost:3001');
  });

  it('builds an API base URL from the configured port', () => {
    expect(buildApiBaseUrl(undefined, 3001)).toBe('http://localhost:3001');
  });
});
