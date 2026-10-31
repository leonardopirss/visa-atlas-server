import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

export function databaseUrlWithSafetyLimits(
  source: string,
  poolMax: number,
  poolTimeoutMs: number,
  statementTimeoutMs: number,
): string {
  const url = new URL(source);
  url.searchParams.set('connection_limit', poolMax.toString());
  url.searchParams.set('pool_timeout', Math.max(1, Math.ceil(poolTimeoutMs / 1_000)).toString());
  url.searchParams.set('options', `-c statement_timeout=${statementTimeoutMs}`);
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Optional() config?: ConfigService) {
    const source = config?.get<string>('DATABASE_URL') ?? process.env.DATABASE_URL;
    if (!source) throw new Error('DATABASE_URL is required');
    super({
      datasourceUrl: databaseUrlWithSafetyLimits(
        source,
        config?.get<number>('DATABASE_POOL_MAX', 5) ?? 5,
        config?.get<number>('DATABASE_POOL_TIMEOUT_MS', 2_000) ?? 2_000,
        config?.get<number>('DATABASE_STATEMENT_TIMEOUT_MS', 5_000) ?? 5_000,
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
