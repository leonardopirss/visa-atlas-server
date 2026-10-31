import { readFile } from 'node:fs/promises';
import {
  Controller,
  Get,
  type INestApplication,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parse } from 'yaml';
import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import { CorrelationIdMiddleware } from '../../src/common/errors/correlation-id.middleware.js';
import { RateLimitMiddleware } from '../../src/common/http/rate-limit.middleware.js';
import { RateLimitPolicyRegistry } from '../../src/common/http/rate-limit.policy.js';
import {
  RATE_LIMIT_STORE,
  type RateLimitStore,
} from '../../src/common/http/redis-rate-limit.store.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('public API contract: defaults, countries and map', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it('loads the shared OpenAPI document and keeps exactly five operations', async () => {
    const source = await readFile('contracts/openapi.yaml', 'utf8');
    const document = parse(source) as { paths?: Record<string, unknown> };
    expect(Object.keys(document.paths ?? {})).toEqual([
      '/filters/defaults',
      '/countries',
      '/stats/map',
      '/countries/{iso3}',
      '/countries/{iso3}/timeseries',
    ]);
  });

  it('returns defaults only from a published comparable release', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/filters/defaults').expect(200);
    expect(response.body).toEqual({
      citizenship: 'BRA',
      purpose: 'WORK',
      year: 2025,
      metricType: 'FIRST_RESIDENCE_PERMITS_GRANTED',
      comparisonGroupId: 'test-comparable-2025',
      unit: 'PER',
      dataAvailable: true,
    });
  });

  it('paginates and searches the country catalog', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/countries?search=espanha&page=1&pageSize=10')
      .expect(200);
    expect(response.body).toMatchObject({
      data: [{ iso3: 'ESP', iso2: 'ES', name: 'Espanha', region: 'Europa' }],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['iso2', 'iso3', 'name', 'region']);
  });

  it('returns availability and statistics in one map payload', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/stats/map').expect(200);
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
    expect(response.headers['ratelimit-limit']).toBe('120');
    expect(response.body.year).toBe(2025);
    expect(response.body.countries).toHaveLength(3);
    expect(response.body.legendLabel).toContain('não representa vistos consulares');
    expect(Object.keys(response.body).sort()).toEqual(
      ['citizenship', 'countries', 'legendLabel', 'purpose', 'year'].sort(),
    );
    expect(Object.keys(response.body.countries[0].statistic).sort()).toEqual(
      [
        'comparisonGroupId',
        'dataStatus',
        'freshness',
        'metricType',
        'period',
        'source',
        'unit',
        'value',
      ].sort(),
    );
  });

  it('preserves body ordering, status, and cache headers across repeated responses', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/stats/map?purpose=WORK&citizenship=BRA')
      .expect(200);
    const repeated = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=BRA&purpose=WORK')
      .expect(200);

    expect(repeated.status).toBe(first.status);
    expect(repeated.text).toBe(first.text);
    expect(repeated.headers['content-type']).toBe(first.headers['content-type']);
    expect(repeated.headers['cache-control']).toBe(first.headers['cache-control']);
  });

  it('returns a typed validation error and correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=invalid')
      .set('x-correlation-id', 'contract-test')
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId: 'contract-test',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('replaces an unsafe correlation id before reflecting it in headers or errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=invalid')
      .set('x-correlation-id', 'contains spaces')
      .expect(400);
    expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
  });
});

@Controller('stats/map')
class RateLimitContractController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

const rejectedStore: RateLimitStore = {
  consume: () =>
    Promise.resolve({
      status: 'ok',
      decision: {
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAtMs: Date.now() + 30_000,
        retryAfterMs: 30_000,
        policy: 'heavy',
      },
    }),
};

@Module({
  controllers: [RateLimitContractController],
  providers: [
    CorrelationIdMiddleware,
    RateLimitMiddleware,
    RateLimitPolicyRegistry,
    {
      provide: ConfigService,
      useValue: new ConfigService({
        RATE_LIMIT_ENABLED: true,
        RATE_LIMIT_MODE: 'enforce',
        RATE_LIMIT_MAX: 120,
        RATE_LIMIT_HEAVY_MAX: 60,
        RATE_LIMIT_DAILY_MAX: 1_000,
      }),
    },
    { provide: RATE_LIMIT_STORE, useValue: rejectedStore },
  ],
})
class RateLimitContractModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, RateLimitMiddleware).forRoutes('{*path}');
  }
}

describe('distributed rate limit HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitContractModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('preserves status, body, Retry-After, and RateLimit headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/stats/map')
      .set('x-correlation-id', 'rate-limit-contract')
      .expect(429);

    expect(response.headers).toMatchObject({
      'cache-control': 'no-store',
      'ratelimit-limit': '60',
      'ratelimit-remaining': '0',
      'retry-after': '30',
    });
    expect(Number(response.headers['ratelimit-reset'])).toBeGreaterThan(
      Math.floor(Date.now() / 1_000),
    );
    expect(response.body).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      correlationId: 'rate-limit-contract',
    });
  });
});
