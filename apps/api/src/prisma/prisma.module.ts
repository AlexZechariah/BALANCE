import { Module } from '@nestjs/common';

import { ScopedPrismaService } from './scoped-prisma.service';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService, ScopedPrismaService],
  exports: [PrismaService, ScopedPrismaService]
})
export class PrismaModule {}
