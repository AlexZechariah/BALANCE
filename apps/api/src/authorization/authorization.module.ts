import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AbilityFactory } from './ability.factory';
import { PolicyGuard } from './policy.guard';
import { PrismaScopeService } from './prisma-scope.service';

@Global()
@Module({
  imports: [AuthModule],
  providers: [AbilityFactory, PolicyGuard, PrismaScopeService],
  exports: [AbilityFactory, PolicyGuard, PrismaScopeService]
})
export class AuthorizationModule {}
