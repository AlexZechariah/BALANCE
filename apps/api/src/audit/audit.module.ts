import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { SecurityAuditService } from './security-audit.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService, SecurityAuditService],
  exports: [AuditService, SecurityAuditService]
})
export class AuditModule {}
