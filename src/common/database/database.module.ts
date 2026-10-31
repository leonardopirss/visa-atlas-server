import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { QueryConcurrencyService } from './query-concurrency.service.js';

@Global()
@Module({
  providers: [PrismaService, QueryConcurrencyService],
  exports: [PrismaService, QueryConcurrencyService],
})
export class DatabaseModule {}
