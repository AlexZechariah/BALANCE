import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { MetricsController } from './metrics.controller';
import { ApiObservabilityInterceptor } from './observability.interceptor';

@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiObservabilityInterceptor
    }
  ]
})
export class ObservabilityModule {}
