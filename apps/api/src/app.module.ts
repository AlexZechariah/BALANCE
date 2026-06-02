import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { StorageModule } from './storage/storage.module';
import { ExtractionModule } from './extraction/extraction.module';
import { QueueModule } from './queue/queue.module';
import { AuditModule } from './audit/audit.module';
import { DocumentsModule } from './documents/documents.module';
import { ClaimsModule } from './claims/claims.module';
import { ReviewsModule } from './reviews/reviews.module';
import { EnterpriseModule } from './enterprise/enterprise.module';
import { BudgetsModule } from './budgets/budgets.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ObservabilityModule,
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    StorageModule,
    QueueModule,
    AuditModule,
    ExtractionModule,
    DocumentsModule,
    ClaimsModule,
    ReviewsModule,
    EnterpriseModule,
    BudgetsModule,
    RateLimitModule
  ],
  controllers: [AppController]
})
export class AppModule {}
