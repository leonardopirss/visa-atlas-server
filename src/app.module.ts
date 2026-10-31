import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './common/cache/cache.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { CorrelationIdMiddleware } from './common/errors/correlation-id.middleware.js';
import { HttpModule } from './common/http/http.module.js';
import { RateLimitMiddleware } from './common/http/rate-limit.middleware.js';
import { CloudflareOriginLockMiddleware } from './common/http/cloudflare-origin-lock.middleware.js';
import { RedisModule } from './common/redis/redis.module.js';
import { validateEnvironment } from './config/environment.js';
import { CountriesModule } from './modules/countries/countries.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { StatisticsModule } from './modules/statistics/statistics.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    RedisModule,
    CacheModule,
    HttpModule,
    StatisticsModule,
    CountriesModule,
    IngestionModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, CloudflareOriginLockMiddleware, RateLimitMiddleware)
      .forRoutes('{*path}');
  }
}
