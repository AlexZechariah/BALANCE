import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthController } from './auth.controller';
import { AuthCleanupService } from './auth-cleanup.service';
import { AuthSecurityAuditService } from './auth-security-audit.service';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { AuthGuard } from './auth.guard';
import { PasswordHashingService } from './password-hashing.service';
import { PasswordResetService } from './password-reset.service';
import { RolesGuard } from './roles.guard';
import { SessionCookieService } from './session-cookie.service';
import { SessionService } from './session.service';
import { VerifiedEmailGuard } from './verified-email.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCleanupService,
    AuthSecurityAuditService,
    EmailVerificationService,
    PasswordHashingService,
    PasswordResetService,
    SessionCookieService,
    SessionService,
    VerifiedEmailGuard,
    AuthGuard,
    RolesGuard
  ],
  exports: [
    AuthService,
    AuthCleanupService,
    AuthSecurityAuditService,
    EmailVerificationService,
    PasswordHashingService,
    PasswordResetService,
    SessionCookieService,
    SessionService,
    VerifiedEmailGuard,
    AuthGuard,
    RolesGuard
  ]
})
export class AuthModule {}
