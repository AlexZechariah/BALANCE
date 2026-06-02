import type { Request, Response } from 'express';

import { loadAppConfig } from '@balance/config';
import { Injectable } from '@nestjs/common';

import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_TTL_MS } from './session.constants';

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.split('=');
    const name = rawName?.trim();
    if (!name) continue;
    cookies.set(name, rawValue.join('=').trim());
  }

  return cookies;
}

@Injectable()
export class SessionCookieService {
  private readonly config = loadAppConfig();

  sessionTokenFromRequest(request: Request): string | null {
    return parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME) || null;
  }

  csrfCookieFromRequest(request: Request): string | null {
    return parseCookies(request.headers.cookie).get(CSRF_COOKIE_NAME) || null;
  }

  setSessionCookies(response: Response, sessionToken: string, csrfToken: string) {
    const secure = this.config.secureCookies;
    response.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_TTL_MS
    });
    response.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_TTL_MS
    });
  }

  clearSessionCookies(response: Response) {
    const secure = this.config.secureCookies;
    response.cookie(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0
    });
    response.cookie(CSRF_COOKIE_NAME, '', {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0
    });
  }
}
