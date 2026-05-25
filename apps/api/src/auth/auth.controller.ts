import { Body, Controller, Get, HttpCode, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import {
  accountUpdateRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  type AccountUpdateRequest,
  type LoginRequest,
  type RegisterRequest
} from '@balance/schemas';

import { ZodValidationPipe } from '../common/zod-validation.pipe';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest) {
    return this.auth.login(body.email, body.password);
  }

  @Post('register')
  @HttpCode(201)
  async register(@Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest) {
    return this.auth.register(body.email, body.password, body.displayName, body.orgName);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  async updateMe(
    @Body(new ZodValidationPipe(accountUpdateRequestSchema)) body: AccountUpdateRequest,
    @CurrentUser() user: { id: string }
  ) {
    return this.auth.updateAccount(user.id, body);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async logout() {
    return { ok: true };
  }
}
