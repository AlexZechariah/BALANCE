import 'reflect-metadata';
import './observability/runtime';

import { loadAppConfig } from '@balance/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { ContractHttpExceptionFilter } from './common/contract-http-exception.filter';
import { configureApiSecurity } from './security/browser-security';

async function bootstrap() {
  const config = loadAppConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], bodyParser: false });
  if (config.trustProxy !== false) {
    app.set('trust proxy', config.trustProxy.length === 1 ? config.trustProxy[0] : config.trustProxy);
  }
  app.useBodyParser('json', { limit: config.apiJsonBodyLimit });
  app.useBodyParser('urlencoded', { limit: config.apiUrlencodedBodyLimit, extended: true });
  app.enableShutdownHooks();
  configureApiSecurity(app, config);
  app.useGlobalFilters(new ContractHttpExceptionFilter());
  await app.listen(config.apiPort, '0.0.0.0');
}

void bootstrap();
