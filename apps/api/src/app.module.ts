import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { QueueModule } from './queue/queue.module';
import { AuditModule } from './audit/audit.module';
import { DocumentsModule } from './documents/documents.module';
import { ClaimsModule } from './claims/claims.module';
import { ReviewsModule } from './reviews/reviews.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { BudgetsModule } from './budgets/budgets.module';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule, QueueModule, AuditModule, DocumentsModule, ClaimsModule, ReviewsModule, EnterpriseModule, BudgetsModule],
  controllers: [AppController]
})
export class AppModule {}
