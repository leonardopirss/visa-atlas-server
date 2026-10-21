import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module.js';
import { CorrelationIdMiddleware } from './common/errors/correlation-id.middleware.js';
import { RateLimitMiddleware } from './common/http/rate-limit.middleware.js';
import { validateEnvironment } from './config/environment.js';
import { CountriesModule } from './modules/countries/countries.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { StatisticsModule } from './modules/statistics/statistics.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    StatisticsModule,
    CountriesModule,
    IngestionModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RateLimitMiddleware).forRoutes('{*path}');
  }
}
