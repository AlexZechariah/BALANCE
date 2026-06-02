import type { Request, Response } from 'express';

import { loadAppConfig } from '@balance/config';
import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  accountUpdateRequestSchema,
  emailVerificationConfirmRequestSchema,
  emailVerificationRequestSchema,
  loginRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
  type AccountUpdateRequest,
  type EmailVerificationConfirmRequest,
  type EmailVerificationRequest,
  type LoginRequest,
  type PasswordResetConfirmRequest,
  type PasswordResetRequest,
  type RegisterRequest
} from '@balance/schemas';

import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { throwContractHttpError } from '../common/contract-errors';
import { BalanceRateLimit } from '../rate-limit/rate-limit.decorator';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { SessionCookieService } from './session-cookie.service';

@Controller('auth')
export class AuthController {
  private readonly config = loadAppConfig();

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PasswordResetService) private readonly passwordReset: PasswordResetService,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(SessionCookieService) private readonly cookies: SessionCookieService
  ) {}

  private localTokenResponse(issued: { token: string | null; expiresAt: Date | null }) {
    const response: { ok: true; devToken?: string; expiresAt?: string | null } = { ok: true };
    if (this.config.authDevExposeAccountTokens && issued.token) {
      response.devToken = issued.token;
      response.expiresAt = issued.expiresAt?.toISOString() ?? null;
    }
    return response;
  }

  @Post('login')
  @BalanceRateLimit('auth')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body.email, body.password);
    this.cookies.setSessionCookies(response, result.sessionToken, result.csrfToken);
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @Post('register')
  @BalanceRateLimit('auth')
  @HttpCode(201)
  async register(@Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest, @Res({ passthrough: true }) response: Response) {
    if (!this.config.authSelfRegistrationEnabled) {
      throwContractHttpError(403, 'AUTH_REGISTRATION_UNAVAILABLE', 'Registration is unavailable', []);
    }
    const result = await this.auth.register(body.email, body.password, body.displayName, body.orgName);
    this.cookies.setSessionCookies(response, result.sessionToken, result.csrfToken);
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @Post('password-reset/request')
  @BalanceRateLimit('auth')
  @HttpCode(200)
  async requestPasswordReset(@Body(new ZodValidationPipe(passwordResetRequestSchema)) body: PasswordResetRequest) {
    const issued = await this.passwordReset.createResetToken(body.email);
    return this.localTokenResponse(issued);
  }

  @Post('password-reset/confirm')
  @BalanceRateLimit('auth')
  @HttpCode(200)
  async confirmPasswordReset(@Body(new ZodValidationPipe(passwordResetConfirmRequestSchema)) body: PasswordResetConfirmRequest) {
    await this.passwordReset.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Post('email-verification/request')
  @BalanceRateLimit('auth')
  @HttpCode(200)
  async requestEmailVerification(@Body(new ZodValidationPipe(emailVerificationRequestSchema)) body: EmailVerificationRequest) {
    const issued = await this.emailVerification.createVerificationTokenForEmail(body.email);
    return this.localTokenResponse(issued);
  }

  @Post('email-verification/confirm')
  @BalanceRateLimit('auth')
  @HttpCode(200)
  async confirmEmailVerification(@Body(new ZodValidationPipe(emailVerificationConfirmRequestSchema)) body: EmailVerificationConfirmRequest) {
    await this.emailVerification.verifyEmail(body.token);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: Request, @CurrentUser() user: { id: string }) {
    return {
      ...(await this.auth.me(user.id)),
      csrfToken: this.cookies.csrfCookieFromRequest(request)
    };
  }

  @Patch('me')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard)
  async updateMe(
    @Body(new ZodValidationPipe(accountUpdateRequestSchema)) body: AccountUpdateRequest,
    @Req() request: Request,
    @CurrentUser() user: { id: string }
  ) {
    return this.auth.updateAccount(user.id, this.cookies.sessionTokenFromRequest(request), body);
  }

  @Get('sessions')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard)
  async sessions(@Req() request: Request, @CurrentUser() user: { id: string }) {
    const sessionToken = this.cookies.sessionTokenFromRequest(request);
    if (!sessionToken) {
      throwContractHttpError(401, 'AUTH_REQUIRED', 'Authentication required', []);
    }
    return this.auth.listSessions(user.id, sessionToken);
  }

  @Post('sessions/revoke-others')
  @BalanceRateLimit('sensitive')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async revokeOtherSessions(
    @Req() request: Request,
    @CurrentUser() user: { id: string; role: string; organizationId: string | null }
  ) {
    const sessionToken = this.cookies.sessionTokenFromRequest(request);
    if (!sessionToken) {
      throwContractHttpError(401, 'AUTH_REQUIRED', 'Authentication required', []);
    }
    return this.auth.revokeOtherSessions(user, sessionToken);
  }

  @Post('logout')
  @BalanceRateLimit('auth')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response, @CurrentUser() user: { id: string; role: string; organizationId: string | null }) {
    const sessionToken = this.cookies.sessionTokenFromRequest(request);
    if (sessionToken) {
      await this.auth.logout(sessionToken, user);
    }
    this.cookies.clearSessionCookies(response);
    return { ok: true };
  }
}
